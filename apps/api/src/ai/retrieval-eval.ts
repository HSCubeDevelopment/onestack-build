/**
 * Card 60.6 — how good is retrieval, actually? Pure scoring helpers; no DB, no network.
 *
 * This exists because the embedding provider is an open decision (see card 60.3), and "which embedder
 * should we buy" should be answered with a number rather than a vibe. Swap the embedder, re-run the
 * harness, compare. It also guards against a silent regression later: retrieval can rot — a prompt
 * change, a model swap, a bad migration — without any test going red, because nothing here throws.
 *
 * The metrics are the standard two for ranked retrieval:
 *   recall@k — of the jobs that SHOULD have been found, how many made the top k? Answers "did we find it".
 *   MRR      — 1/rank of the first correct hit, averaged. Answers "was it near the top", which is what
 *              matters when only the first few precedents reach the prompt (MAX_PRECEDENTS).
 *
 * A case with no expected matches is a NEGATIVE case: retrieval should return nothing, and returning
 * something is the failure. Those are scored separately as precision, because folding them into recall
 * would let a system that returns everything look perfect.
 */

/** One question to ask the index: "given this job, which past jobs should come back?" */
export interface EvalCase {
  /** Human-readable, so a failing case is identifiable in the report. */
  name: string;
  /** The job being scoped. */
  queryJobId: string;
  /** Job ids that a correct system returns. Empty means "should return nothing". */
  expectedJobIds: string[];
}

/** What retrieval actually returned for a case, best first. */
export interface EvalResult {
  name: string;
  returnedJobIds: string[];
}

export interface EvalScore {
  cases: number;
  /** Cases that expected at least one match. */
  positiveCases: number;
  /** Cases that expected nothing back. */
  negativeCases: number;
  /** Of all expected matches, the fraction that appeared in the top k. 0..1. */
  recallAtK: number;
  /** Mean reciprocal rank of the first correct hit, over positive cases. 0..1. */
  mrr: number;
  /** Of negative cases, the fraction that correctly returned nothing. 0..1. */
  negativeAccuracy: number;
  /** Cases where nothing correct was retrieved at all — the ones worth reading. */
  misses: string[];
}

/**
 * Score results against the gold set.
 *
 * `k` bounds how far down the list a hit still counts. Default 3 matches MAX_PRECEDENTS: a correct job
 * ranked 8th is not a success, because it never reaches the prompt.
 */
export function scoreRetrieval(cases: EvalCase[], results: EvalResult[], k = 3): EvalScore {
  const byName = new Map(results.map((r) => [r.name, r.returnedJobIds]));

  let expectedTotal = 0;
  let foundTotal = 0;
  let reciprocalRankSum = 0;
  let positives = 0;
  let negatives = 0;
  let negativesCorrect = 0;
  const misses: string[] = [];

  for (const testCase of cases) {
    const returned = (byName.get(testCase.name) ?? []).slice(0, k);

    if (testCase.expectedJobIds.length === 0) {
      negatives++;
      if (returned.length === 0) negativesCorrect++;
      else misses.push(`${testCase.name} (expected nothing, got ${returned.length})`);
      continue;
    }

    positives++;
    expectedTotal += testCase.expectedJobIds.length;
    const hits = testCase.expectedJobIds.filter((id) => returned.includes(id));
    foundTotal += hits.length;

    // Rank of the FIRST correct hit — 1-indexed, because "rank 0" has no meaning to a reader.
    const firstHitIndex = returned.findIndex((id) => testCase.expectedJobIds.includes(id));
    if (firstHitIndex === -1) misses.push(`${testCase.name} (no correct job in top ${k})`);
    else reciprocalRankSum += 1 / (firstHitIndex + 1);
  }

  return {
    cases: cases.length,
    positiveCases: positives,
    negativeCases: negatives,
    // A gold set with no positive cases would divide by zero; report 0 rather than NaN, which would
    // propagate silently through any comparison a reader makes.
    recallAtK: expectedTotal === 0 ? 0 : foundTotal / expectedTotal,
    mrr: positives === 0 ? 0 : reciprocalRankSum / positives,
    negativeAccuracy: negatives === 0 ? 1 : negativesCorrect / negatives,
    misses,
  };
}

/** Render a score as a short human report — what a provider comparison actually gets read from. */
export function formatScore(label: string, score: EvalScore, k: number): string {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const lines = [
    `${label}`,
    `  cases           ${score.cases} (${score.positiveCases} positive, ${score.negativeCases} negative)`,
    `  recall@${k}        ${pct(score.recallAtK)}`,
    `  MRR             ${score.mrr.toFixed(3)}`,
    `  no-false-hits   ${pct(score.negativeAccuracy)}`,
  ];
  if (score.misses.length) {
    lines.push(`  misses:`);
    for (const miss of score.misses.slice(0, 10)) lines.push(`    - ${miss}`);
  }
  return lines.join('\n');
}
