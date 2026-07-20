import { describe, expect, it } from 'vitest';
import { EvalCase, EvalResult, formatScore, scoreRetrieval } from './retrieval-eval';
import { GOLD_JOBS, GOLD_QUERIES } from './retrieval-gold-set';

const testCase = (name: string, expectedJobIds: string[]): EvalCase => ({
  name,
  queryJobId: `q-${name}`,
  expectedJobIds,
});
const result = (name: string, returnedJobIds: string[]): EvalResult => ({ name, returnedJobIds });

describe('scoreRetrieval', () => {
  it('scores a perfect run at 1', () => {
    const cases = [testCase('a', ['j1', 'j2'])];
    const score = scoreRetrieval(cases, [result('a', ['j1', 'j2'])]);
    expect(score.recallAtK).toBe(1);
    expect(score.mrr).toBe(1);
    expect(score.misses).toEqual([]);
  });

  it('only counts hits inside the top k — a precedent nobody sees is not a success', () => {
    // The correct job is ranked 4th; with k=3 it never reaches the prompt, so it must not score.
    const cases = [testCase('a', ['j1'])];
    const score = scoreRetrieval(cases, [result('a', ['x', 'y', 'z', 'j1'])], 3);
    expect(score.recallAtK).toBe(0);
    expect(score.misses[0]).toContain('no correct job in top 3');
  });

  it('rewards ranking the right job higher (MRR)', () => {
    const cases = [testCase('a', ['j1'])];
    const first = scoreRetrieval(cases, [result('a', ['j1', 'x'])]);
    const second = scoreRetrieval(cases, [result('a', ['x', 'j1'])]);

    expect(first.mrr).toBe(1); // rank 1 → 1/1
    expect(second.mrr).toBe(0.5); // rank 2 → 1/2
    // Recall alone can't tell these apart, which is exactly why MRR is reported too.
    expect(first.recallAtK).toBe(second.recallAtK);
  });

  it('scores partial recall proportionally', () => {
    const cases = [testCase('a', ['j1', 'j2'])];
    const score = scoreRetrieval(cases, [result('a', ['j1', 'x'])]);
    expect(score.recallAtK).toBe(0.5);
    expect(score.mrr).toBe(1); // the first hit was still rank 1
  });

  it('treats "should return nothing" as its own kind of correct', () => {
    const cases = [testCase('neg', [])];
    expect(scoreRetrieval(cases, [result('neg', [])]).negativeAccuracy).toBe(1);

    const wrong = scoreRetrieval(cases, [result('neg', ['j1'])]);
    expect(wrong.negativeAccuracy).toBe(0);
    expect(wrong.misses[0]).toContain('expected nothing');
  });

  it('does not let negative cases inflate recall', () => {
    // A system returning nothing for everything gets full marks on the negative case and zero on the
    // positive one. Folding them together would hide that.
    const cases = [testCase('pos', ['j1']), testCase('neg', [])];
    const score = scoreRetrieval(cases, [result('pos', []), result('neg', [])]);
    expect(score.recallAtK).toBe(0);
    expect(score.negativeAccuracy).toBe(1);
  });

  it('counts a missing result as a miss rather than throwing', () => {
    // A harness that crashes on a dropped case is useless for comparing providers.
    const score = scoreRetrieval([testCase('a', ['j1'])], []);
    expect(score.recallAtK).toBe(0);
    expect(score.misses).toHaveLength(1);
  });

  it('reports 0 rather than NaN when the gold set has no positive cases', () => {
    const score = scoreRetrieval([testCase('neg', [])], [result('neg', [])]);
    expect(score.recallAtK).toBe(0);
    expect(score.mrr).toBe(0);
    expect(Number.isNaN(score.recallAtK)).toBe(false);
  });
});

describe('formatScore', () => {
  it('renders the numbers a provider comparison is read from', () => {
    const score = scoreRetrieval([testCase('a', ['j1'])], [result('a', ['j1'])]);
    const text = formatScore('stub', score, 3);
    expect(text).toContain('stub');
    expect(text).toContain('recall@3');
    expect(text).toContain('100.0%');
    expect(text).toContain('MRR');
  });
});

describe('gold set', () => {
  it('every expected id refers to a job that is actually indexed', () => {
    // A typo here would silently cap the achievable score below 100%, making a good provider look bad.
    const known = new Set(GOLD_JOBS.map((j) => j.id));
    for (const query of GOLD_QUERIES) {
      for (const id of query.expectedJobIds) {
        expect(known, `${query.name} expects unknown job ${id}`).toContain(id);
      }
    }
  });

  it('has ids that are unique', () => {
    expect(new Set(GOLD_JOBS.map((j) => j.id)).size).toBe(GOLD_JOBS.length);
  });

  it('includes at least one negative case, or the harness cannot detect over-eager retrieval', () => {
    expect(GOLD_QUERIES.some((q) => q.expectedJobIds.length === 0)).toBe(true);
  });
});
