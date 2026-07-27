import { describe, expect, it } from 'vitest';
import { checkClaimCompleteness, CompletenessInput } from './claim-completeness';

const full: CompletenessInput = {
  claim: { claimNumber: 'CLM-1', authorisedAmountCents: 500000, excessCents: 69500 },
  customer: { id: 'c1' },
  insurer: { id: 'i1' },
  vehicles: [{}],
  photos: [{}, {}, {}, {}],
  quotes: [{ status: 'Accepted' }],
  invoices: [{}],
};

describe('checkClaimCompleteness', () => {
  it('a fully-populated pack is ready with no gaps', () => {
    const { gaps, ready } = checkClaimCompleteness(full);
    expect(ready).toBe(true);
    expect(gaps).toEqual([]);
  });

  it('flags every required gap and is not ready when they are present', () => {
    const empty: CompletenessInput = {
      claim: null,
      customer: null,
      insurer: null,
      vehicles: [],
      photos: [],
      quotes: [],
      invoices: [],
    };
    const { gaps, ready } = checkClaimCompleteness(empty);
    expect(ready).toBe(false);
    const required = gaps.filter((g) => g.severity === 'required').map((g) => g.section);
    expect(required).toEqual(
      expect.arrayContaining(['Parties', 'Claim', 'Vehicle', 'Damage evidence', 'Quote']),
    );
  });

  it('recommends authority + excess + insurer when missing but stays ready (not required)', () => {
    const v: CompletenessInput = {
      ...full,
      insurer: null,
      claim: { claimNumber: 'CLM-1', authorisedAmountCents: null, excessCents: null },
    };
    const { gaps, ready } = checkClaimCompleteness(v);
    expect(ready).toBe(true); // no required gaps
    const codes = gaps.map((g) => g.message);
    expect(codes.some((m) => /authorised amount/i.test(m))).toBe(true);
    expect(codes.some((m) => /excess/i.test(m))).toBe(true);
    expect(codes.some((m) => /insurer/i.test(m))).toBe(true);
  });

  it('nudges on too-few photos and a draft-only quote', () => {
    const v: CompletenessInput = { ...full, photos: [{}], quotes: [{ status: 'Draft' }] };
    const { gaps } = checkClaimCompleteness(v);
    expect(
      gaps.some((g) => g.section === 'Damage evidence' && /Only 1 photo/.test(g.message)),
    ).toBe(true);
    expect(gaps.some((g) => g.section === 'Quote' && /still a draft/i.test(g.message))).toBe(true);
  });
});
