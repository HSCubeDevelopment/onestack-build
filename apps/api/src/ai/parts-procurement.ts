import { roundHalfUp } from '../money/money';

/**
 * Card 62.1 — parts procurement. Pure; no DB, no Nest.
 *
 * The card's point in one line: *parts margin is invisible, and it's where the money is made.* A parts
 * line used to be description + quantity + sell price, so nobody could see whether a $185 bumper cost
 * $90 or $170. This module makes that visible and computes it exactly.
 *
 * Like the estimating module (30.1), this NEVER touches GST. Margin is computed on the buy and sell
 * figures as entered; whether those are tax-inclusive is the line-item engine's business, and mixing
 * the two here is how a shop ends up quoting margin on a GST component it never keeps.
 */

/** Part quality tiers a panel shop actually distinguishes. Insurers care; so does the customer. */
export type PartGrade = 'oem' | 'aftermarket' | 'used' | 'reconditioned';

export const PART_GRADES: PartGrade[] = ['oem', 'aftermarket', 'used', 'reconditioned'];

/**
 * Where a part is in the ordering cycle. Deliberately separate from the purchase order's own status:
 * one PO can be sent while a line on it is back-ordered and another has already landed.
 */
export type ProcurementStatus = 'needed' | 'ordered' | 'back_order' | 'received' | 'cancelled';

export const PROCUREMENT_STATUSES: ProcurementStatus[] = [
  'needed',
  'ordered',
  'back_order',
  'received',
  'cancelled',
];

export interface PartMargin {
  /** Sell minus buy, in cents, for the whole line (× quantity). Negative when sold at a loss. */
  marginCents: number;
  /**
   * Margin as a percentage OF THE SELL PRICE, one decimal place. Null when the buy price is unknown —
   * see the note on why that is not zero.
   */
  marginPercent: number | null;
  /** True when we genuinely don't know, so a UI can say "—" instead of a misleading number. */
  unknown: boolean;
}

export interface PartLineForMargin {
  quantity: number;
  /** What the customer pays, per unit. */
  unitPriceCents: number;
  /** What the shop pays, per unit. Null = not recorded yet. */
  buyPriceCents: number | null;
}

/**
 * Margin for one parts line.
 *
 * Percentage is of SELL, not of cost. Both conventions exist; sell-based is what a panel shop's P&L
 * and every insurer schedule uses ("we make 35 points on parts"), so cost-based would quietly report a
 * different number from the one the owner has in their head.
 *
 * An unknown buy price returns `unknown: true` rather than 0%. Treating a missing cost as zero would
 * show 100% margin on every part nobody has priced yet — the most flattering possible lie, on exactly
 * the number the card says the business runs on.
 */
export function partMargin(line: PartLineForMargin): PartMargin {
  if (!Number.isInteger(line.quantity) || line.quantity < 0) {
    throw new RangeError(`quantity must be a non-negative integer, got ${line.quantity}`);
  }
  const sell = line.quantity * line.unitPriceCents;

  if (line.buyPriceCents === null || line.buyPriceCents === undefined) {
    return { marginCents: 0, marginPercent: null, unknown: true };
  }
  const buy = line.quantity * line.buyPriceCents;
  const marginCents = sell - buy;

  // Selling at zero with a real cost is a 100% loss, not a divide-by-zero. Report the dollars and
  // decline the percentage rather than returning Infinity, which no UI renders sensibly.
  if (sell === 0) {
    return { marginCents, marginPercent: marginCents === 0 ? 0 : null, unknown: false };
  }

  return {
    marginCents,
    marginPercent: roundHalfUp((marginCents / sell) * 1000) / 10,
    unknown: false,
  };
}

export interface PartsSummary {
  lineCount: number;
  sellTotalCents: number;
  /** Only the lines whose buy price is known — see `unpricedCount`. */
  buyTotalCents: number;
  marginCents: number;
  marginPercent: number | null;
  /** Lines with no buy price. The margin above EXCLUDES these, so this number qualifies it. */
  unpricedCount: number;
}

/**
 * Roll a job's parts up into one margin figure.
 *
 * Unpriced lines are excluded from both totals rather than counted as zero-cost, and reported
 * separately. That keeps the percentage truthful — it is the margin on the parts we actually know
 * about — while `unpricedCount` tells the reader how much of the picture is missing. Folding them in
 * either direction would produce a single confident number that is wrong.
 */
export function summariseParts(lines: PartLineForMargin[]): PartsSummary {
  const priced = lines.filter((l) => l.buyPriceCents !== null && l.buyPriceCents !== undefined);

  const sellTotalCents = priced.reduce((sum, l) => sum + l.quantity * l.unitPriceCents, 0);
  const buyTotalCents = priced.reduce(
    (sum, l) => sum + l.quantity * (l.buyPriceCents as number),
    0,
  );
  const marginCents = sellTotalCents - buyTotalCents;

  return {
    lineCount: lines.length,
    sellTotalCents,
    buyTotalCents,
    marginCents,
    marginPercent:
      sellTotalCents === 0 ? null : roundHalfUp((marginCents / sellTotalCents) * 1000) / 10,
    unpricedCount: lines.length - priced.length,
  };
}

/**
 * Whether a status change is allowed.
 *
 * Deliberately permissive in one direction and strict in the other: anything can be cancelled, and a
 * back-order can go back to ordered, because suppliers really do change their minds. What is refused
 * is leaving `received` — once stock is physically on the shelf, moving it back to "ordered" would
 * make the goods-received record meaningless. Correcting a mistaken receipt is a separate, deliberate
 * action, not a status flip.
 */
export function canTransitionTo(from: ProcurementStatus, to: ProcurementStatus): boolean {
  if (from === to) return true;
  if (from === 'received') return false;
  if (to === 'cancelled') return true;
  const allowed: Record<ProcurementStatus, ProcurementStatus[]> = {
    needed: ['ordered'],
    ordered: ['back_order', 'received'],
    back_order: ['ordered', 'received'],
    received: [],
    cancelled: ['needed'], // re-open a cancelled line rather than forcing a duplicate
  };
  return allowed[from].includes(to);
}

/**
 * Status implied by a delivery. Partial deliveries are the norm — 2 of 3 guards arrive — so receiving
 * some of a line leaves it back-ordered rather than marking the whole line received.
 */
export function statusAfterReceipt(
  ordered: number,
  receivedSoFar: number,
): Extract<ProcurementStatus, 'back_order' | 'received'> {
  return receivedSoFar >= ordered ? 'received' : 'back_order';
}
