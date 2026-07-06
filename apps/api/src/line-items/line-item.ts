import { gstFromInclusive, gstFromNet } from '../money/money';

/**
 * Line Item money core (card #6.9) — the ONE shared implementation used by BOTH Quote and Invoice, so
 * the maths can't drift. Money is always integer cents. GST follows the AU rules from the money module
 * (#5.1): a GST line's price is either tax-inclusive (GST is 1/11 of it) or tax-exclusive (GST added on
 * top); GST_FREE lines carry no GST. Pricing/discount logic is a separate card (out of scope here).
 */
export type TaxCode = 'GST' | 'GST_FREE';
export type TaxTreatment = 'inclusive' | 'exclusive';
export type LineType = 'labour' | 'product' | 'time';

export interface LineItemInput {
  description: string;
  type: LineType;
  quantity: number; // whole units, >= 0
  unitPriceCents: number; // integer cents, >= 0
  taxCode: TaxCode;
  taxTreatment: TaxTreatment;
}

export interface ComputedLine extends LineItemInput {
  netCents: number; // GST-exclusive
  gstCents: number;
  totalCents: number; // GST-inclusive (net + gst)
}

export interface Totals {
  netCents: number;
  gstCents: number;
  totalCents: number;
}

function assertCount(n: number, label: string): void {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(`${label} must be a non-negative integer, got ${n}`);
  }
}

/** Compute one line's net / GST / total in cents. Deterministic (same input → same output). */
export function computeLine(input: LineItemInput): ComputedLine {
  assertCount(input.quantity, 'quantity');
  assertCount(input.unitPriceCents, 'unitPriceCents');
  const amount = input.quantity * input.unitPriceCents; // the entered line amount, at the given treatment

  let netCents: number;
  let gstCents: number;
  let totalCents: number;

  if (input.taxCode === 'GST_FREE') {
    netCents = amount;
    gstCents = 0;
    totalCents = amount;
  } else if (input.taxTreatment === 'inclusive') {
    const b = gstFromInclusive(amount); // GST is 1/11 of the inclusive amount
    netCents = b.net;
    gstCents = b.gst;
    totalCents = amount;
  } else {
    const b = gstFromNet(amount); // GST added on top of the net amount
    netCents = amount;
    gstCents = b.gst;
    totalCents = b.total;
  }

  return { ...input, netCents, gstCents, totalCents };
}

/** Compute a batch of lines. */
export function computeLines(inputs: LineItemInput[]): ComputedLine[] {
  return inputs.map(computeLine);
}

/** Roll computed lines up into document totals (a Quote or Invoice total). */
export function summarize(lines: ComputedLine[]): Totals {
  return lines.reduce<Totals>(
    (acc, l) => ({
      netCents: acc.netCents + l.netCents,
      gstCents: acc.gstCents + l.gstCents,
      totalCents: acc.totalCents + l.totalCents,
    }),
    { netCents: 0, gstCents: 0, totalCents: 0 },
  );
}
