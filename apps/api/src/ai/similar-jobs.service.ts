import { Injectable } from '@nestjs/common';
import { DamageScopeService } from './damage-scope.service';
import { EmbeddingIndexService, IndexablePiece } from './embedding-index.service';
import { SimilarJobMatch, foldToJobs, renderScopeForEmbedding } from './similar-jobs';

/**
 * Card 60.4 — similar-past-jobs retrieval, the RAG core. Given a job, find the shop's OWN past jobs
 * that most resemble it, so card 60.5 can ground the AI's draft quote in real prior work instead of a
 * generic prior.
 *
 * This is the seam between "what a job is" (the damage scope) and "how jobs are compared" (the vector
 * index). It owns neither: it reads scopes through DamageScopeService and searches through
 * EmbeddingIndexService, both public services — never their tables.
 */

/** Below this, a match is noise dressed up as evidence and must not be shown as precedent. */
export const MIN_SIMILARITY = 0.6;

@Injectable()
export class SimilarJobsService {
  constructor(
    private readonly scopes: DamageScopeService,
    private readonly index: EmbeddingIndexService,
  ) {}

  /**
   * Add (or refresh) a job's scope in the index. Call this once a scope is settled — it's what makes
   * the job available as precedent for FUTURE jobs.
   *
   * Returns how many pieces were embedded: 0 means the scope was already indexed unchanged.
   */
  async indexJob(tenantId: string, jobId: string): Promise<number> {
    const scope = await this.scopes.getForJob(tenantId, jobId);
    const text = renderScopeForEmbedding(scope.summary, scope.items);
    if (!text.trim()) return 0; // an empty scope carries no signal — indexing it would only add noise

    const piece: IndexablePiece = {
      kind: 'scope',
      // One scope row per job: null sourceId, deduped by the NULLS NOT DISTINCT unique index.
      sourceId: null,
      snippet: text.slice(0, 200),
      input: { kind: 'scope', text },
    };
    return this.index.indexWorkItem(tenantId, jobId, [piece]);
  }

  /**
   * Find past jobs resembling this one. Excludes the job itself (it matches its own vector perfectly)
   * and anything below MIN_SIMILARITY, so a caller never has to decide what counts as evidence.
   *
   * Returns [] when the job has no scope yet — there is nothing to compare, which is different from
   * "compared and found nothing", and the caller should be able to tell those apart by asking whether
   * a scope exists rather than by getting a silently empty list from a broken query.
   */
  async findSimilarJobs(tenantId: string, jobId: string, limit = 5): Promise<SimilarJobMatch[]> {
    const scope = await this.scopes.getForJob(tenantId, jobId);
    const text = renderScopeForEmbedding(scope.summary, scope.items);
    if (!text.trim()) return [];

    // Over-fetch pieces so folding to jobs still has enough distinct jobs to fill `limit` — one job
    // can occupy several piece slots, and the cap keeps a photo-heavy job from starving the rest.
    const hits = await this.index.findSimilar(
      tenantId,
      { kind: 'scope', text },
      { limit: Math.min(limit * 4, 50), excludeWorkItemId: jobId },
    );

    return foldToJobs(hits, limit).filter((match) => match.similarity >= MIN_SIMILARITY);
  }
}
