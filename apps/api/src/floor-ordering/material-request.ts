/**
 * Pure logic for floor ordering (Phase 2). No DB, no network — cheap to unit test. Normalises the
 * requested lines and encodes the small status machine: requested → approved | rejected, approved →
 * ordered. Emailing the order is a separate vendor-gated step; this only tracks state.
 */

export type MaterialRequestStatus = 'requested' | 'approved' | 'rejected' | 'ordered';

export interface RawLine {
  description: string;
  quantity?: number;
  notes?: string | null;
}

export interface NormalLine {
  description: string;
  quantity: number;
  notes: string | null;
}

/** Validate + normalise the requested lines. Throws (via the provided factory) on bad input. */
export function normaliseLines(raw: RawLine[], fail: (msg: string) => Error): NormalLine[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw fail('A material request needs at least one line');
  }
  return raw.map((l, idx) => {
    const description = l.description?.trim();
    if (!description) throw fail(`lines[${idx}].description is required`);
    const quantity = l.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw fail(`lines[${idx}].quantity must be an integer ≥ 1`);
    }
    return { description, quantity, notes: l.notes?.trim() || null };
  });
}

/** Only a request still awaiting a decision can be approved or rejected. */
export function canDecide(status: MaterialRequestStatus): boolean {
  return status === 'requested';
}

/** Only an approved request can be ordered. */
export function canOrder(status: MaterialRequestStatus): boolean {
  return status === 'approved';
}
