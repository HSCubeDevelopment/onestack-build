/** Instant photo-estimate types + helpers. Mirrors the API's EstimateResult / EstimateDraft shapes. */

export type DamageOperation = 'replace' | 'repair' | 'paint';

export interface EstimateFix {
  panel: string;
  operation: DamageOperation;
  note?: string;
  confidence?: number;
}
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
  fixes: EstimateFix[];
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

export type EstimateResult =
  { configured: false } | ({ configured: true; analyzer: string } & EstimateDraft);

export const GST_RATE = 0.1;

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Recompute the money totals client-side as the estimator edits parts, labour, the rate, or materials.
 * Mirrors the server's `priceScope` arithmetic exactly (labour = sum(hours) × rate; GST 10%).
 */
export function recompute(input: {
  parts: EstimatePart[];
  labour: EstimateLabour[];
  labourRateAud: number;
  materialsAud: number;
}): {
  partsSubtotalAud: number;
  labourSubtotalAud: number;
  subtotalAud: number;
  gstAud: number;
  totalAud: number;
} {
  const partsSubtotalAud = round2(
    input.parts.reduce((s, p) => s + (Number(p.quantity) || 0) * (Number(p.unitPriceAud) || 0), 0),
  );
  const hours = input.labour.reduce((s, l) => s + (Number(l.hours) || 0), 0);
  const labourSubtotalAud = round2(hours * (Number(input.labourRateAud) || 0));
  const materialsAud = round2(Number(input.materialsAud) || 0);
  const subtotalAud = round2(partsSubtotalAud + labourSubtotalAud + materialsAud);
  const gstAud = round2(subtotalAud * GST_RATE);
  const totalAud = round2(subtotalAud + gstAud);
  return { partsSubtotalAud, labourSubtotalAud, subtotalAud, gstAud, totalAud };
}

/** "$1,234.50" — AUD, always two decimals. */
export function aud(n: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(
    Number.isFinite(n) ? n : 0,
  );
}

export const OPERATION_LABEL: Record<DamageOperation, string> = {
  replace: 'Replace',
  repair: 'Repair',
  paint: 'Paint',
};
