/**
 * Pure reviews/reputation logic (Phase 3). No DB — cheap to unit test. Validates a star rating and
 * aggregates submitted reviews into a reputation summary (count, average, star distribution).
 */

export function validateRating(n: unknown, fail: (msg: string) => Error): number {
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 5) {
    throw fail('rating must be an integer from 1 to 5');
  }
  return n;
}

export interface RatedReview {
  rating: number;
}

export interface ReputationSummary {
  count: number;
  /** Mean rating rounded to 2 dp, or null when there are no reviews. */
  average: number | null;
  /** Count of reviews at each star level, index 0 = 1★ … index 4 = 5★. */
  distribution: [number, number, number, number, number];
}

/** Aggregate submitted reviews into a reputation summary. */
export function summariseReputation(reviews: RatedReview[]): ReputationSummary {
  const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  let total = 0;
  for (const r of reviews) {
    if (r.rating >= 1 && r.rating <= 5) {
      const idx = r.rating - 1;
      distribution[idx] = (distribution[idx] ?? 0) + 1;
      total += r.rating;
    }
  }
  const count = reviews.length;
  return {
    count,
    average: count === 0 ? null : Math.round((total / count) * 100) / 100,
    distribution,
  };
}
