/**
 * Pure logic for supplier invoice capture (Phase 2). No DB — cheap to unit test. Normalises captured
 * lines and totals what we owe the supplier.
 */

export type SupplierInvoiceStatus = 'draft' | 'confirmed' | 'exported';

export interface RawInvoiceLine {
  description: string;
  quantity?: number;
  unitPriceCents?: number;
}

export interface NormalInvoiceLine {
  description: string;
  quantity: number;
  unitPriceCents: number;
}

/** Validate + normalise captured lines. Throws (via the provided factory) on bad input. */
export function normaliseInvoiceLines(
  raw: RawInvoiceLine[],
  fail: (msg: string) => Error,
): NormalInvoiceLine[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw fail('A supplier invoice needs at least one line');
  }
  return raw.map((l, idx) => {
    const description = l.description?.trim();
    if (!description) throw fail(`lines[${idx}].description is required`);
    const quantity = l.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw fail(`lines[${idx}].quantity must be an integer ≥ 1`);
    }
    const unitPriceCents = l.unitPriceCents ?? 0;
    if (!Number.isInteger(unitPriceCents) || unitPriceCents < 0) {
      throw fail(`lines[${idx}].unitPriceCents must be a non-negative integer`);
    }
    return { description, quantity, unitPriceCents };
  });
}

/** Total owed = sum of quantity × unit price across the invoice's lines. */
export function supplierInvoiceTotalCents(
  lines: { quantity: number; unitPriceCents: number }[],
): number {
  return lines.reduce((sum, l) => sum + l.quantity * l.unitPriceCents, 0);
}
