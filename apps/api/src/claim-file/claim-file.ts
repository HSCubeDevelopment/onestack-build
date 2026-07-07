/**
 * Pure helpers for the claim file (Phase 2 — group a claim's artefacts against a job). No DB, no network
 * — cheap to unit test. The claim file is a read-model that gathers a job's photos, quotes and invoices
 * into one pack a shop can hand an insurer. These functions shape the counts and the financial snapshot.
 */

export interface Countable {
  photos: unknown[];
  quotes: unknown[];
  invoices: unknown[];
}

export interface ClaimFileCounts {
  photos: number;
  quotes: number;
  invoices: number;
}

export interface InvoiceMoney {
  totalCents: number;
  paidCents: number;
  balanceCents: number;
}

export interface ClaimFinancials {
  invoicedCents: number;
  paidCents: number;
  outstandingCents: number;
}

/** How many of each artefact the claim pack contains. */
export function claimFileCounts(pieces: Countable): ClaimFileCounts {
  return {
    photos: pieces.photos.length,
    quotes: pieces.quotes.length,
    invoices: pieces.invoices.length,
  };
}

/** A financial snapshot of the claim: what's been invoiced, paid, and is still outstanding. */
export function claimFinancials(invoices: InvoiceMoney[]): ClaimFinancials {
  return {
    invoicedCents: invoices.reduce((s, i) => s + i.totalCents, 0),
    paidCents: invoices.reduce((s, i) => s + i.paidCents, 0),
    outstandingCents: invoices.reduce((s, i) => s + i.balanceCents, 0),
  };
}
