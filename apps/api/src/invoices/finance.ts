/**
 * Money & Payments read-model — PURE math (FIN-1). No DB, no Nest: it takes plain invoice rows and
 * returns the owner's finance picture, so every number here is unit-tested without a database.
 *
 * All money is integer cents. Nothing here CHANGES money — it only aggregates what invoices/payments
 * already say, per the money-rules doc (compute once, integer cents).
 *
 * PAYER CLASSIFICATION (a stated assumption for review): a portion is treated as an INSURER payer when
 * it carries a `payerName` (an external party not in Contacts — how the excess-split records an insurer),
 * and as a CUSTOMER (excess) payer otherwise. An invoice with no portions is a single customer payer.
 * If insurers should instead be identified by a contact tag, this is the one place to change.
 */

export type PayerType = 'insurer' | 'customer';

export interface FinancePortionRow {
  payerName: string | null;
  payerContactId: string | null;
  amountCents: number;
}

export interface FinanceInvoiceRow {
  status: string; // 'Unpaid' | 'Paid' | 'Void'
  issueDate: Date;
  dueDate: Date | null;
  billedCents: number; // sum of line items
  paidCents: number; // sum of payments received
  lastPaymentAt: Date | null; // when it was settled, if fully paid
  portions: FinancePortionRow[];
}

export interface AgingBuckets {
  d0_30: number;
  d30_60: number;
  d60_90: number;
  d90_plus: number;
}

export interface InsurerScore {
  name: string;
  owedCents: number;
  avgDaysToPay: number | null; // null when nothing has been paid yet to judge
}

export interface MoneyOverview {
  owedCents: number; // outstanding across all non-void invoices
  overdueCents: number; // outstanding past due date
  bankedLast30Cents: number; // payments received in the last 30 days
  pipeline: {
    invoicedAwaitingCents: number; // billed but not yet paid
    paidLast30Cents: number;
  };
  agingByPayer: {
    insurer: AgingBuckets;
    customer: AgingBuckets;
  };
  insurerScorecard: InsurerScore[];
  needsChasing: {
    overdueCount: number;
    overdueCents: number;
    uncollectedExcessCents: number; // outstanding owed by customers
  };
}

const emptyBuckets = (): AgingBuckets => ({ d0_30: 0, d30_60: 0, d60_90: 0, d90_plus: 0 });

const DAY = 86_400_000;

/** Days between two dates, floored, never negative. */
function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / DAY));
}

function addToBucket(b: AgingBuckets, ageDays: number, cents: number): void {
  if (ageDays <= 30) b.d0_30 += cents;
  else if (ageDays <= 60) b.d30_60 += cents;
  else if (ageDays <= 90) b.d60_90 += cents;
  else b.d90_plus += cents;
}

function classifyPortion(p: FinancePortionRow): PayerType {
  return p.payerName && p.payerName.trim() ? 'insurer' : 'customer';
}

/**
 * Split an invoice's outstanding balance across its payer types. A split invoice (insurer + excess)
 * apportions the outstanding pro-rata by portion amount; a single-payer invoice is all customer.
 */
function outstandingByPayer(inv: FinanceInvoiceRow): { insurer: number; customer: number } {
  const outstanding = Math.max(0, inv.billedCents - inv.paidCents);
  if (outstanding === 0) return { insurer: 0, customer: 0 };
  const total = inv.portions.reduce((s, p) => s + p.amountCents, 0);
  if (inv.portions.length === 0 || total <= 0) {
    return { insurer: 0, customer: outstanding };
  }
  let insurer = 0;
  let customer = 0;
  let allocated = 0;
  inv.portions.forEach((p, i) => {
    // Last portion takes the rounding remainder so the split reconciles to the outstanding exactly.
    const share =
      i === inv.portions.length - 1
        ? outstanding - allocated
        : Math.round((outstanding * p.amountCents) / total);
    allocated += share;
    if (classifyPortion(p) === 'insurer') insurer += share;
    else customer += share;
  });
  return { insurer, customer };
}

/**
 * Build the owner's money picture from invoice rows. `now` is injected so the maths is deterministic
 * and testable. Void invoices are ignored entirely (they are not money owed).
 */
export function buildMoneyOverview(invoices: FinanceInvoiceRow[], now: Date): MoneyOverview {
  const since30 = new Date(now.getTime() - 30 * DAY);
  const live = invoices.filter((i) => i.status !== 'Void');

  let owedCents = 0;
  let overdueCents = 0;
  let bankedLast30Cents = 0;
  const insurerAging = emptyBuckets();
  const customerAging = emptyBuckets();
  let overdueCount = 0;
  let uncollectedExcessCents = 0;

  // Insurer scorecard accumulation.
  const scoreOwed = new Map<string, number>();
  const scoreDays = new Map<string, { totalDays: number; n: number }>();

  for (const inv of live) {
    const outstanding = Math.max(0, inv.billedCents - inv.paidCents);
    owedCents += outstanding;

    // Payments landing in the last 30 days count as banked, whatever the invoice's status now.
    if (inv.lastPaymentAt && inv.lastPaymentAt >= since30) {
      bankedLast30Cents += Math.min(inv.paidCents, inv.billedCents);
    }

    const ageFrom = inv.dueDate ?? inv.issueDate;
    const overdue = inv.dueDate != null && inv.dueDate < now && outstanding > 0;
    if (overdue) {
      overdueCents += outstanding;
      overdueCount += 1;
    }

    const split = outstandingByPayer(inv);
    uncollectedExcessCents += split.customer;
    const ageDays = daysBetween(ageFrom, now);
    addToBucket(insurerAging, ageDays, split.insurer);
    addToBucket(customerAging, ageDays, split.customer);

    // Scorecard: attribute an insurer portion's outstanding to its name; and, when the invoice is
    // settled, record how long that took as a days-to-pay sample.
    for (const p of inv.portions) {
      if (classifyPortion(p) !== 'insurer') continue;
      const name = p.payerName!.trim();
      // Outstanding share owed to this insurer (its portion, capped by the invoice's outstanding).
      const portionTotal = inv.portions.reduce((s, q) => s + q.amountCents, 0) || 1;
      const owed = Math.round((outstanding * p.amountCents) / portionTotal);
      scoreOwed.set(name, (scoreOwed.get(name) ?? 0) + owed);
      if (inv.status === 'Paid' && inv.lastPaymentAt) {
        const d = daysBetween(inv.issueDate, inv.lastPaymentAt);
        const cur = scoreDays.get(name) ?? { totalDays: 0, n: 0 };
        scoreDays.set(name, { totalDays: cur.totalDays + d, n: cur.n + 1 });
      }
    }
  }

  const paidLast30Cents = bankedLast30Cents;

  const names = new Set<string>([...scoreOwed.keys(), ...scoreDays.keys()]);
  const insurerScorecard: InsurerScore[] = [...names]
    .map((name) => {
      const days = scoreDays.get(name);
      return {
        name,
        owedCents: scoreOwed.get(name) ?? 0,
        avgDaysToPay: days && days.n > 0 ? Math.round(days.totalDays / days.n) : null,
      };
    })
    .sort((a, b) => b.owedCents - a.owedCents);

  return {
    owedCents,
    overdueCents,
    bankedLast30Cents,
    pipeline: { invoicedAwaitingCents: owedCents, paidLast30Cents },
    agingByPayer: { insurer: insurerAging, customer: customerAging },
    insurerScorecard,
    needsChasing: { overdueCount, overdueCents, uncollectedExcessCents },
  };
}
