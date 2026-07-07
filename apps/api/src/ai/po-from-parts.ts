/**
 * Pure logic for turning a parts list into draft purchase-order lines (Phase 2 flagship, slice C). No DB,
 * no network — cheap to unit test. A PO line seeds its cost from the part's price as an editable starting
 * point (the estimator adjusts to the real supplier cost before confirming). Nothing here is sent.
 */

export interface PartLike {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
}

export interface PoLineDraft {
  description: string;
  quantity: number;
  unitPriceCents: number;
  scopePartId: string;
}

/** Seed PO lines from the parts list — one line per part, carrying provenance back to the scope part. */
export function poLinesFromParts(parts: PartLike[]): PoLineDraft[] {
  return parts.map((p) => ({
    description: p.description,
    quantity: p.quantity,
    unitPriceCents: p.unitPriceCents,
    scopePartId: p.id,
  }));
}

/** Total expected cost of a PO = sum of quantity × unit cost across its lines. */
export function poTotalCents(lines: { quantity: number; unitPriceCents: number }[]): number {
  return lines.reduce((sum, l) => sum + l.quantity * l.unitPriceCents, 0);
}
