import { describe, expect, it } from 'vitest';
import { buildMoneyOverview, FinanceInvoiceRow } from './finance';

const NOW = new Date('2026-07-21T00:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

/** A convenience builder with sensible defaults. */
function inv(over: Partial<FinanceInvoiceRow> = {}): FinanceInvoiceRow {
  return {
    status: 'Unpaid',
    issueDate: daysAgo(10),
    dueDate: null,
    billedCents: 0,
    paidCents: 0,
    lastPaymentAt: null,
    portions: [],
    ...over,
  };
}

describe('buildMoneyOverview', () => {
  it('is all zeros for no invoices', () => {
    const o = buildMoneyOverview([], NOW);
    expect(o.owedCents).toBe(0);
    expect(o.overdueCents).toBe(0);
    expect(o.insurerScorecard).toEqual([]);
    expect(o.agingByPayer.insurer).toEqual({ d0_30: 0, d30_60: 0, d60_90: 0, d90_plus: 0 });
  });

  it('sums outstanding as owed, and treats a no-portion invoice as customer money', () => {
    const o = buildMoneyOverview([inv({ billedCents: 10_000, paidCents: 3_000 })], NOW);
    expect(o.owedCents).toBe(7_000);
    expect(o.needsChasing.uncollectedExcessCents).toBe(7_000);
    expect(o.agingByPayer.customer.d0_30).toBe(7_000);
    expect(o.agingByPayer.insurer.d0_30).toBe(0);
  });

  it('ignores Void invoices entirely', () => {
    const o = buildMoneyOverview([inv({ status: 'Void', billedCents: 9_999 })], NOW);
    expect(o.owedCents).toBe(0);
  });

  it('splits a part-paid insurer+excess invoice pro-rata by portion, reconciling exactly', () => {
    // $3,120 authorised (insurer) + $695 excess (customer) = $3,815 billed; $1,000 paid → $2,815 out.
    const o = buildMoneyOverview(
      [
        inv({
          billedCents: 381_500,
          paidCents: 100_000,
          portions: [
            { payerName: 'AAMI', payerContactId: null, amountCents: 312_000 },
            { payerName: null, payerContactId: 'cust-1', amountCents: 69_500 },
          ],
        }),
      ],
      NOW,
    );
    const insurer = o.agingByPayer.insurer;
    const customer = o.agingByPayer.customer;
    const insurerTotal = insurer.d0_30 + insurer.d30_60 + insurer.d60_90 + insurer.d90_plus;
    const customerTotal = customer.d0_30 + customer.d30_60 + customer.d60_90 + customer.d90_plus;
    // The two payer splits reconcile EXACTLY to the $2,815 outstanding (no cent lost to rounding).
    expect(insurerTotal + customerTotal).toBe(281_500);
    // Insurer share is the larger (312k of 381.5k) — ~81.8% of 281,500.
    expect(insurerTotal).toBe(Math.round((281_500 * 312_000) / 381_500));
    expect(o.needsChasing.uncollectedExcessCents).toBe(customerTotal);
  });

  it('buckets outstanding by age from the due date', () => {
    const rows = [
      inv({ billedCents: 100, dueDate: daysAgo(10) }), // 0-30
      inv({ billedCents: 200, dueDate: daysAgo(45) }), // 30-60
      inv({ billedCents: 400, dueDate: daysAgo(75) }), // 60-90
      inv({ billedCents: 800, dueDate: daysAgo(120) }), // 90+
    ];
    const c = buildMoneyOverview(rows, NOW).agingByPayer.customer;
    expect(c).toEqual({ d0_30: 100, d30_60: 200, d60_90: 400, d90_plus: 800 });
  });

  it('falls back to the issue date when there is no due date', () => {
    const o = buildMoneyOverview(
      [inv({ billedCents: 500, issueDate: daysAgo(100), dueDate: null })],
      NOW,
    );
    expect(o.agingByPayer.customer.d90_plus).toBe(500);
    // No due date → never counted as "overdue".
    expect(o.overdueCents).toBe(0);
  });

  it('counts overdue only when past a real due date with a balance', () => {
    const o = buildMoneyOverview(
      [
        inv({ billedCents: 1_000, dueDate: daysAgo(5) }), // overdue
        inv({ billedCents: 1_000, dueDate: new Date(NOW.getTime() + 5 * 86_400_000) }), // future
        inv({ billedCents: 1_000, paidCents: 1_000, dueDate: daysAgo(5) }), // paid off → not overdue
      ],
      NOW,
    );
    expect(o.needsChasing.overdueCount).toBe(1);
    expect(o.overdueCents).toBe(1_000);
  });

  it('counts only payments from the last 30 days as banked', () => {
    const o = buildMoneyOverview(
      [
        inv({ status: 'Paid', billedCents: 5_000, paidCents: 5_000, lastPaymentAt: daysAgo(10) }),
        inv({ status: 'Paid', billedCents: 7_000, paidCents: 7_000, lastPaymentAt: daysAgo(40) }),
      ],
      NOW,
    );
    expect(o.bankedLast30Cents).toBe(5_000);
    expect(o.pipeline.paidLast30Cents).toBe(5_000);
  });

  it('scores insurers by amount owed and average days to pay, slowest-owed first', () => {
    const o = buildMoneyOverview(
      [
        // AAMI: one settled in 34 days, one still owing 200.
        inv({
          status: 'Paid',
          billedCents: 1_000,
          paidCents: 1_000,
          issueDate: daysAgo(40),
          lastPaymentAt: daysAgo(6),
          portions: [{ payerName: 'AAMI', payerContactId: null, amountCents: 1_000 }],
        }),
        inv({
          billedCents: 200,
          paidCents: 0,
          portions: [{ payerName: 'AAMI', payerContactId: null, amountCents: 200 }],
        }),
        // GIO: owes 500, nothing paid yet → avgDaysToPay null.
        inv({
          billedCents: 500,
          portions: [{ payerName: 'GIO', payerContactId: null, amountCents: 500 }],
        }),
      ],
      NOW,
    );
    const byName = new Map(o.insurerScorecard.map((s) => [s.name, s]));
    expect(byName.get('GIO')?.owedCents).toBe(500);
    expect(byName.get('GIO')?.avgDaysToPay).toBeNull();
    expect(byName.get('AAMI')?.owedCents).toBe(200);
    expect(byName.get('AAMI')?.avgDaysToPay).toBe(34);
    // Sorted by owed desc: GIO (500) before AAMI (200).
    expect(o.insurerScorecard[0]?.name).toBe('GIO');
  });
});
