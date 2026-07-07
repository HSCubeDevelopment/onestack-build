// Unit tests for the pure claim-file helpers (Phase 2): artefact counts, the financial snapshot, and
// the no-op sharer. No DB — the DB-backed assembly is covered by the integration test.
import { describe, expect, it } from 'vitest';
import { claimFileCounts, claimFinancials } from './claim-file';
import { NoopClaimPackSharer } from './claim-pack-sharer';

describe('claimFileCounts', () => {
  it('counts each artefact kind', () => {
    expect(
      claimFileCounts({ photos: [1, 2, 3], quotes: [1], invoices: [], documents: [1, 2] }),
    ).toEqual({
      photos: 3,
      quotes: 1,
      invoices: 0,
      documents: 2,
    });
  });
});

describe('claimFinancials', () => {
  it('sums invoiced, paid and outstanding across invoices', () => {
    expect(
      claimFinancials([
        { totalCents: 121000, paidCents: 2200, balanceCents: 118800 },
        { totalCents: 5000, paidCents: 5000, balanceCents: 0 },
      ]),
    ).toEqual({ invoicedCents: 126000, paidCents: 7200, outstandingCents: 118800 });
  });

  it('is all zero with no invoices', () => {
    expect(claimFinancials([])).toEqual({
      invoicedCents: 0,
      paidCents: 0,
      outstandingCents: 0,
    });
  });
});

describe('NoopClaimPackSharer', () => {
  it('shares nothing and says why (no vendor auto-shares a claim)', async () => {
    const result = await new NoopClaimPackSharer().share();
    expect(result.shared).toBe(false);
    expect(result.url).toBeNull();
    expect(result.reason).toMatch(/no sharing provider/i);
  });
});
