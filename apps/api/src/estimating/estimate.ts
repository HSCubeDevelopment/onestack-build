import { LineItemInput, TaxCode, TaxTreatment } from '../line-items/line-item';
import { roundHalfUp } from '../money/money';

/**
 * Card 30.1 — the estimating model. Pure; no DB, no Nest.
 *
 * WHY THIS EXISTS. A panel estimator does not think in "quantity × unit price". They think in
 * *2.4 hours of body labour at the body rate*, *paint materials for 3 panels*, *a sublet windscreen at
 * cost plus margin*. Card 30 gave us free-text lines, and the card's own words are that generic lines
 * "leak margin" — because nobody can see whether the hours were right, only the dollar total.
 *
 * WHAT IT DOES NOT DO. It never computes GST. Not once. `docs/money-rules.md` is emphatic that GST is
 * computed in exactly one place or it drifts, so this module's entire output is `LineItemInput[]` which
 * then goes through the existing line-item engine unchanged. Everything here is about getting the
 * *amount* right; the tax engine stays the only thing that knows what tax is.
 *
 * THE INTEGER-HOURS PROBLEM. `LineItemInput.quantity` must be a non-negative integer, but labour is
 * decimal (2.4 h). Rather than loosen the money core — the riskiest possible edit — an estimate line is
 * emitted as `quantity: 1` with the fully-computed amount as its unit price, and the working written
 * into the description ("Body labour — 2.4 h @ $95.00/h"). The estimator's arithmetic stays visible to
 * a human reading the quote, and the money core keeps its integer guarantee.
 */

/** The trades a panel shop bills separately, because their hourly rates genuinely differ. */
export type Discipline = 'body' | 'paint' | 'mechanical';

export const DISCIPLINES: Discipline[] = ['body', 'paint', 'mechanical'];

/** Hourly rates, in integer cents, one per discipline. Sourced from the price book. */
export type RateCard = Record<Discipline, number>;

export type EstimateLineKind = 'labour' | 'paint-materials' | 'part' | 'sublet';

interface BaseLine {
  /** What the line is for — a panel, an operation, a part name. */
  description: string;
  taxCode?: TaxCode;
  taxTreatment?: TaxTreatment;
}

/** Hours of a trade at that trade's rate. */
export interface LabourLine extends BaseLine {
  kind: 'labour';
  discipline: Discipline;
  /** Decimal hours, e.g. 2.4. Rounded to hundredths before pricing — see `priceLabour`. */
  hours: number;
}

/**
 * Paint materials. Costed per PAINT HOUR, which is how a panel shop actually buys them: the consumables
 * for a job scale with time in the booth, not with the panel's dollar value.
 */
export interface PaintMaterialsLine extends BaseLine {
  kind: 'paint-materials';
  paintHours: number;
  /** Materials rate per paint hour, integer cents. */
  ratePerHourCents: number;
}

/** A physical part at a unit price. Whole units — you cannot fit half a bumper. */
export interface PartLine extends BaseLine {
  kind: 'part';
  quantity: number;
  unitPriceCents: number;
}

/**
 * Work sent out (windscreen, wheel alignment, upholstery). Billed at cost plus a margin, because the
 * shop carries the risk and the warranty on someone else's work.
 */
export interface SubletLine extends BaseLine {
  kind: 'sublet';
  costCents: number;
  /** Margin as a percentage of cost, e.g. 20 for 20%. Zero is legitimate (pass-through). */
  marginPercent: number;
}

export type EstimateLine = LabourLine | PaintMaterialsLine | PartLine | SubletLine;

/** Money formatted for a human reading the quote, e.g. 9500 → "$95.00". Display edge only. */
function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Hours rendered without trailing noise: 2 → "2", 2.4 → "2.4", 2.45 → "2.45". */
function hours(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * Hours are captured to the hundredth. Anything finer is false precision — no estimator distinguishes
 * 2.404 h from 2.4 h — and leaving it unrounded would make the printed working disagree with the amount.
 */
export function normaliseHours(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`hours must be a non-negative finite number, got ${value}`);
  }
  return Math.round(value * 100) / 100;
}

/**
 * Price hours × rate to exact integer cents.
 *
 * Computed as `roundHalfUp(hundredthsOfAnHour × rate / 100)` so the arithmetic runs over integers and
 * cannot pick up a binary-floating-point error — 2.4 × 9500 is 22799.999… in IEEE754, which would
 * silently become $227.99 instead of $228.00. Rounding is half-up at the cent, matching money-rules §4.
 */
export function priceLabour(hoursWorked: number, rateCents: number): number {
  const h = normaliseHours(hoursWorked);
  if (!Number.isInteger(rateCents) || rateCents < 0) {
    throw new RangeError(`rate must be a non-negative integer of cents, got ${rateCents}`);
  }
  return roundHalfUp((Math.round(h * 100) * rateCents) / 100);
}

/** Sublet: cost plus a percentage margin, rounded half-up at the cent. */
export function priceSublet(costCents: number, marginPercent: number): number {
  if (!Number.isInteger(costCents) || costCents < 0) {
    throw new RangeError(`cost must be a non-negative integer of cents, got ${costCents}`);
  }
  if (!Number.isFinite(marginPercent) || marginPercent < 0) {
    throw new RangeError(`margin must be a non-negative percentage, got ${marginPercent}`);
  }
  return costCents + roundHalfUp((costCents * marginPercent) / 100);
}

/**
 * Turn one estimate line into a line-item input.
 *
 * Defaults to GST / exclusive: a shop quotes trade-style ex-GST and the engine adds it. A caller can
 * override per line (a GST-free sublet, say) but the default is the common case rather than a surprise.
 */
export function toLineItem(line: EstimateLine, rates: RateCard): LineItemInput {
  const taxCode: TaxCode = line.taxCode ?? 'GST';
  const taxTreatment: TaxTreatment = line.taxTreatment ?? 'exclusive';

  switch (line.kind) {
    case 'labour': {
      const rate = rates[line.discipline];
      if (rate === undefined) throw new RangeError(`no rate configured for ${line.discipline}`);
      const amount = priceLabour(line.hours, rate);
      return {
        // The working stays on the line so a human reading the quote can check the estimator's maths.
        description: `${line.description} — ${hours(line.hours)} h @ ${money(rate)}/h`,
        type: 'labour',
        quantity: 1,
        unitPriceCents: amount,
        taxCode,
        taxTreatment,
      };
    }
    case 'paint-materials': {
      const amount = priceLabour(line.paintHours, line.ratePerHourCents);
      return {
        description: `${line.description} — ${hours(line.paintHours)} h @ ${money(line.ratePerHourCents)}/h`,
        // 'product' rather than 'labour': materials are consumed goods, and the distinction is what
        // lets a margin report separate labour recovery from materials recovery later.
        type: 'product',
        quantity: 1,
        unitPriceCents: amount,
        taxCode,
        taxTreatment,
      };
    }
    case 'part':
      return {
        description: line.description,
        type: 'product',
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        taxCode,
        taxTreatment,
      };
    case 'sublet': {
      const amount = priceSublet(line.costCents, line.marginPercent);
      const suffix = line.marginPercent > 0 ? ` (sublet, +${line.marginPercent}%)` : ' (sublet)';
      return {
        description: `${line.description}${suffix}`,
        type: 'product',
        quantity: 1,
        unitPriceCents: amount,
        taxCode,
        taxTreatment,
      };
    }
  }
}

/** Convert a whole estimate. Order is preserved — an estimate reads in the order it was built. */
export function toLineItems(lines: EstimateLine[], rates: RateCard): LineItemInput[] {
  return lines.map((line) => toLineItem(line, rates));
}

/**
 * Hours by discipline across an estimate. Not money — this is the number an owner uses to see whether
 * the shop is selling the hours it has, which is the thing generic free-text lines made invisible.
 */
export function labourHoursByDiscipline(lines: EstimateLine[]): Record<Discipline, number> {
  const totals: Record<Discipline, number> = { body: 0, paint: 0, mechanical: 0 };
  for (const line of lines) {
    if (line.kind === 'labour') totals[line.discipline] += normaliseHours(line.hours);
  }
  // Re-round: repeated addition of hundredths reintroduces float error (0.1 + 0.2 = 0.30000000000000004).
  for (const d of DISCIPLINES) totals[d] = Math.round(totals[d] * 100) / 100;
  return totals;
}
