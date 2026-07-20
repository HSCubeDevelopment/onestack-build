/**
 * Pure helpers for similar-past-jobs retrieval (card 60.4). No DB, no network — cheap to unit test.
 *
 * The job here is turning a damage scope into the ONE piece of text that represents it in the index,
 * and folding per-piece search hits back into per-JOB results. Both are pure decisions about shape, so
 * they live away from the service that does the I/O.
 */

import { DamageScopeItemView } from './damage-scope.service';
import { SimilarJob } from './embedding-index.service';

/** A past job, scored by its best-matching piece. */
export interface SimilarJobMatch {
  workItemId: string;
  /** Best similarity across this job's pieces, 0..1. */
  similarity: number;
  /** The snippet of the piece that matched best — so a human can see WHY it was retrieved. */
  bestSnippet: string;
  /** How many of this job's pieces matched at all. More pieces agreeing is weak corroboration. */
  matchedPieces: number;
}

/**
 * Render a scope into the text that gets embedded. Deterministic and order-independent: items are
 * sorted, so two scopes listing the same work in a different order embed identically rather than
 * landing in slightly different directions and scoring as if they were different jobs.
 *
 * Confidence and ids are deliberately excluded — they say nothing about what the repair IS, and
 * including them would make an unchanged scope re-embed every time the AI re-ran with new confidences.
 */
export function renderScopeForEmbedding(summary: string, items: DamageScopeItemView[]): string {
  const lines = items
    .map((item) => {
      const note = item.note?.trim();
      return note
        ? `${item.panel} — ${item.operation} (${note})`
        : `${item.panel} — ${item.operation}`;
    })
    .sort((a, b) => a.localeCompare(b));

  const head = summary.trim();
  return [head, ...lines].filter(Boolean).join('\n');
}

/**
 * Fold per-piece hits into per-job matches, keeping each job's BEST piece.
 *
 * A job with six photos gets six chances to match, so ranking raw pieces would let one photo-heavy job
 * crowd out every other result. Scoring a job by its single best piece keeps one job = one row, and
 * `matchedPieces` still exposes how much of it agreed.
 */
export function foldToJobs(hits: SimilarJob[], limit: number): SimilarJobMatch[] {
  const byJob = new Map<string, SimilarJobMatch>();

  for (const hit of hits) {
    const existing = byJob.get(hit.workItemId);
    if (!existing) {
      byJob.set(hit.workItemId, {
        workItemId: hit.workItemId,
        similarity: hit.similarity,
        bestSnippet: hit.snippet,
        matchedPieces: 1,
      });
      continue;
    }
    existing.matchedPieces += 1;
    if (hit.similarity > existing.similarity) {
      existing.similarity = hit.similarity;
      existing.bestSnippet = hit.snippet;
    }
  }

  return [...byJob.values()].sort((a, b) => b.similarity - a.similarity).slice(0, limit);
}
