// Unit tests for the pure reviews/reputation logic + no-op invite sender (Phase 3). No DB.
import { describe, expect, it } from 'vitest';
import { summariseReputation, validateRating } from './review';
import { NoopReviewInviteSender } from './review-invite-sender';

const fail = (m: string) => new Error(m);

describe('validateRating', () => {
  it('accepts 1..5 integers', () => {
    expect(validateRating(5, fail)).toBe(5);
  });
  it('rejects out-of-range and non-integers', () => {
    expect(() => validateRating(0, fail)).toThrow(/1 to 5/);
    expect(() => validateRating(6, fail)).toThrow(/1 to 5/);
    expect(() => validateRating(4.5, fail)).toThrow(/1 to 5/);
    expect(() => validateRating('5' as unknown, fail)).toThrow(/1 to 5/);
  });
});

describe('summariseReputation', () => {
  it('computes count, average (2dp) and star distribution', () => {
    const s = summariseReputation([{ rating: 5 }, { rating: 4 }, { rating: 5 }, { rating: 2 }]);
    expect(s.count).toBe(4);
    expect(s.average).toBe(4); // (5+4+5+2)/4 = 4.00
    expect(s.distribution).toEqual([0, 1, 0, 1, 2]); // 1★..5★
  });
  it('is empty (average null) with no reviews', () => {
    expect(summariseReputation([])).toEqual({
      count: 0,
      average: null,
      distribution: [0, 0, 0, 0, 0],
    });
  });
});

describe('NoopReviewInviteSender', () => {
  it('sends nothing and says why', async () => {
    const r = await new NoopReviewInviteSender().send();
    expect(r.sent).toBe(false);
    expect(r.reason).toMatch(/no email\/sms provider/i);
  });
});
