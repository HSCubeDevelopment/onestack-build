/**
 * Instant estimate pricing (employee photo-quote). Pure; no DB, no Nest, no network.
 *
 * The AI damage analyzer (slice A) turns photos into a scope — a list of panels and the operation each
 * needs (replace / repair / paint). This module turns that scope into a *rough dollar estimate* so a
 * shop-floor worker can give a customer a ballpark on the spot. It is deliberately simple and fully
 * transparent: labour is hours-per-operation × a rate, parts are one placeholder line per replaced
 * panel, materials are a flat per-panel paint charge. Every number is a STARTING POINT the human edits
 * before it becomes a real quote — the UI says so, and nothing here is ever sent or ordered.
 */
import { DamageAnalysisResult, DamageOperation, DamageScopeItem } from './damage-analyzer';

/** Default panel-shop labour rate, AUD/hour ex-GST. Editable per estimate. */
export const DEFAULT_LABOUR_RATE_AUD = 95;

/**
 * Rough labour hours per operation — a ballpark, not a measurement. Replace takes the longest (strip,
 * fit, align), repair next, paint the least on its own. The estimator adjusts per panel.
 */
export const LABOUR_HOURS: Record<DamageOperation, number> = {
  replace: 3,
  repair: 2.5,
  paint: 2,
};

/** Placeholder cost for a replaced panel, AUD ex-GST. Flagged in the UI as "confirm the real price". */
export const DEFAULT_PART_PRICE_AUD = 350;

/** Paint & consumables per painted or replaced panel, AUD ex-GST. */
export const PAINT_MATERIALS_AUD = 120;

/** Australian GST. */
export const GST_RATE = 0.1;

export interface EstimatePart {
  name: string;
  quantity: number;
  unitPriceAud: number;
}

export interface EstimateLabour {
  task: string;
  operation: DamageOperation;
  hours: number;
}

export interface EstimateDraft {
  summary: string;
  /** The scope straight from the analyzer — "what needs fixing", editable. */
  fixes: DamageScopeItem[];
  parts: EstimatePart[];
  labour: EstimateLabour[];
  labourRateAud: number;
  partsSubtotalAud: number;
  labourSubtotalAud: number;
  materialsAud: number;
  subtotalAud: number;
  gstAud: number;
  totalAud: number;
  disclaimer: string;
}

export const ESTIMATE_DISCLAIMER =
  'AI-assisted estimate from photos. It cannot see hidden or structural damage, and every price is a ' +
  'rough starting point — review each line and confirm prices before quoting a customer.';

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Turn a damage scope into a priced draft estimate. Deterministic; the arithmetic is the whole point. */
export function priceScope(
  result: DamageAnalysisResult,
  opts: { labourRateAud?: number } = {},
): EstimateDraft {
  const rate =
    opts.labourRateAud && Number.isFinite(opts.labourRateAud) && opts.labourRateAud > 0
      ? opts.labourRateAud
      : DEFAULT_LABOUR_RATE_AUD;

  const parts: EstimatePart[] = result.items
    .filter((i) => i.operation === 'replace')
    .map((i) => ({
      name: `${i.panel} (replacement panel)`,
      quantity: 1,
      unitPriceAud: DEFAULT_PART_PRICE_AUD,
    }));

  const labour: EstimateLabour[] = result.items.map((i) => ({
    task: `${i.operation} ${i.panel}`,
    operation: i.operation,
    hours: LABOUR_HOURS[i.operation],
  }));

  // A replaced or freshly painted panel needs paint and consumables; a plain repair may not.
  const paintedPanels = result.items.filter(
    (i) => i.operation === 'replace' || i.operation === 'paint',
  ).length;

  const partsSubtotalAud = round2(parts.reduce((s, p) => s + p.quantity * p.unitPriceAud, 0));
  const labourSubtotalAud = round2(labour.reduce((s, l) => s + l.hours * rate, 0));
  const materialsAud = round2(paintedPanels * PAINT_MATERIALS_AUD);
  const subtotalAud = round2(partsSubtotalAud + labourSubtotalAud + materialsAud);
  const gstAud = round2(subtotalAud * GST_RATE);
  const totalAud = round2(subtotalAud + gstAud);

  return {
    summary: result.summary,
    fixes: result.items,
    parts,
    labour,
    labourRateAud: rate,
    partsSubtotalAud,
    labourSubtotalAud,
    materialsAud,
    subtotalAud,
    gstAud,
    totalAud,
    disclaimer: ESTIMATE_DISCLAIMER,
  };
}

export interface QuoteLabourLine {
  description: string;
  unitPriceCents: number;
}

export interface ScopeQuoteLines {
  labour: QuoteLabourLine[];
  materialsCents: number;
  paintedPanels: number;
}

/**
 * Labour + paint-materials lines for a PERSISTED quote, derived from a damage scope. Money in CENTS —
 * the quote engine's unit. Each operation becomes one labour line priced hours × rate, collapsed to a
 * single unit so the integer-quantity quote engine can still carry fractional hours (the hours are shown
 * in the description). Replaced or painted panels accrue a flat paint-materials charge. Deterministic and
 * a starting point — the estimator edits every line before the quote leaves Draft.
 */
export function labourLinesFromScope(
  items: { panel: string; operation: DamageOperation }[],
  rateAud: number = DEFAULT_LABOUR_RATE_AUD,
): ScopeQuoteLines {
  const rate = Number.isFinite(rateAud) && rateAud > 0 ? rateAud : DEFAULT_LABOUR_RATE_AUD;
  const labour: QuoteLabourLine[] = items.map((i) => {
    const hours = LABOUR_HOURS[i.operation];
    const op = i.operation.charAt(0).toUpperCase() + i.operation.slice(1);
    return {
      description: `${op} ${i.panel} — ${hours} h @ $${rate}/h`,
      unitPriceCents: Math.round(hours * rate * 100),
    };
  });
  const paintedPanels = items.filter(
    (i) => i.operation === 'replace' || i.operation === 'paint',
  ).length;
  const materialsCents = Math.round(paintedPanels * PAINT_MATERIALS_AUD * 100);
  return { labour, materialsCents, paintedPanels };
}
