import { describe, expect, it } from 'vitest';
import { DamageScopeItemView } from './damage-scope.service';
import { SimilarJob } from './embedding-index.service';
import { foldToJobs, renderScopeForEmbedding } from './similar-jobs';

const item = (
  panel: string,
  operation: DamageScopeItemView['operation'],
  note: string | null = null,
): DamageScopeItemView => ({
  id: `${panel}-${operation}`,
  panel,
  operation,
  note,
  confidence: 0.9,
});

const hit = (workItemId: string, similarity: number, snippet = 's'): SimilarJob => ({
  workItemId,
  kind: 'scope',
  snippet,
  similarity,
});

describe('renderScopeForEmbedding', () => {
  it('includes the summary and every item', () => {
    const text = renderScopeForEmbedding('Front-end collision', [
      item('Front bumper', 'replace'),
      item('Bonnet', 'repair', 'Dent'),
    ]);
    expect(text).toContain('Front-end collision');
    expect(text).toContain('Front bumper — replace');
    expect(text).toContain('Bonnet — repair (Dent)');
  });

  it('is order-independent — the same work in a different order embeds identically', () => {
    // Two estimators listing the same repairs in different orders describe the SAME job. If order
    // leaked into the text they'd embed in different directions and fail to match each other.
    const a = renderScopeForEmbedding('Collision', [
      item('Front bumper', 'replace'),
      item('Bonnet', 'repair'),
    ]);
    const b = renderScopeForEmbedding('Collision', [
      item('Bonnet', 'repair'),
      item('Front bumper', 'replace'),
    ]);
    expect(a).toBe(b);
  });

  it('ignores confidence and ids, so re-running the AI does not force a re-embed', () => {
    const base = item('Front bumper', 'replace');
    const a = renderScopeForEmbedding('Collision', [base]);
    const b = renderScopeForEmbedding('Collision', [{ ...base, id: 'other', confidence: 0.2 }]);
    expect(a).toBe(b);
  });

  it('distinguishes a different operation on the same panel', () => {
    const repair = renderScopeForEmbedding('x', [item('Front bumper', 'repair')]);
    const replace = renderScopeForEmbedding('x', [item('Front bumper', 'replace')]);
    expect(repair).not.toBe(replace);
  });

  it('produces nothing for an empty scope, so the caller can skip indexing it', () => {
    expect(renderScopeForEmbedding('', []).trim()).toBe('');
  });
});

describe('foldToJobs', () => {
  it('scores a job by its best piece, not by how many pieces it has', () => {
    // The whole point: a job with many photos gets many chances to match. Ranking raw pieces would let
    // one photo-heavy job occupy every slot and crowd out better matches.
    const folded = foldToJobs(
      [hit('busy', 0.5), hit('busy', 0.5), hit('busy', 0.5), hit('good', 0.9)],
      5,
    );
    expect(folded.map((f) => f.workItemId)).toEqual(['good', 'busy']);
    expect(folded[0]?.similarity).toBe(0.9);
  });

  it('collapses each job to one row and counts how many of its pieces matched', () => {
    const folded = foldToJobs([hit('j1', 0.9), hit('j1', 0.7), hit('j2', 0.8)], 5);
    expect(folded).toHaveLength(2);
    expect(folded.find((f) => f.workItemId === 'j1')?.matchedPieces).toBe(2);
    expect(folded.find((f) => f.workItemId === 'j2')?.matchedPieces).toBe(1);
  });

  it('keeps the snippet of the BEST piece, so the reason shown matches the score', () => {
    const folded = foldToJobs([hit('j1', 0.4, 'weak match'), hit('j1', 0.95, 'strong match')], 5);
    expect(folded[0]?.similarity).toBe(0.95);
    expect(folded[0]?.bestSnippet).toBe('strong match');
  });

  it('respects the limit after folding, not before', () => {
    // Three pieces of one job plus two other jobs: limit 2 must yield 2 JOBS, not 2 pieces.
    const folded = foldToJobs(
      [hit('j1', 0.9), hit('j1', 0.85), hit('j1', 0.8), hit('j2', 0.7), hit('j3', 0.6)],
      2,
    );
    expect(folded.map((f) => f.workItemId)).toEqual(['j1', 'j2']);
  });

  it('returns nothing for no hits', () => {
    expect(foldToJobs([], 5)).toEqual([]);
  });
});
