import { Injectable } from '@nestjs/common';
import { DamageScopeItemView } from './damage-scope.service';
import { EmbeddingIndexService, IndexablePiece } from './embedding-index.service';
import { SimilarJobMatch, foldToJobs, renderScopeForEmbedding } from './similar-jobs';

/**
 * Card 60.4 — similar-past-jobs retrieval, the RAG core. Given a job, find the shop's OWN past jobs
 * that most resemble it, so card 60.5 can ground the AI's draft in real prior work.
 *
 * This depends on the vector index ONLY. Scopes are passed in by whoever owns them rather than fetched
 * here — otherwise this and DamageScopeService would each need the other, and the module would need a
 * forwardRef to start at all. Taking the scope as an argument also makes every path here directly
 * testable without standing up the scope service.
 */

/** Below this, a match is noise dressed up as evidence and must not be shown as precedent. */
export const MIN_SIMILARITY = 0.6;

/** The part of a damage scope that describes the work. */
export interface ScopeForComparison {
  summary: string;
  items: DamageScopeItemView[];
}

/** A job photo, already loaded, ready to embed. */
export interface IndexablePhoto {
  /** The attachment row this came from — the piece's stable identity for dedupe. */
  attachmentId: string;
  contentType: string;
  /** Raw image bytes, base64-encoded (no data: prefix). */
  dataBase64: string;
}

@Injectable()
export class SimilarJobsService {
  constructor(private readonly index: EmbeddingIndexService) {}

  /**
   * Add (or refresh) a job in the index — what makes it available as precedent for FUTURE jobs.
   * Indexes the scope text, plus each photo if supplied.
   *
   * Returns how many pieces were embedded; 0 means everything was already indexed unchanged.
   */
  async indexJob(
    tenantId: string,
    jobId: string,
    scope: ScopeForComparison,
    photos: IndexablePhoto[] = [],
  ): Promise<number> {
    const text = renderScopeForEmbedding(scope.summary, scope.items);
    if (!text.trim()) return 0; // an empty scope carries no signal — indexing it would only add noise

    const snippet = text.slice(0, 200);
    const pieces: IndexablePiece[] = [
      {
        kind: 'scope',
        // One scope row per job: null sourceId, deduped by the NULLS NOT DISTINCT unique index.
        sourceId: null,
        snippet,
        input: { kind: 'scope', text },
      },
      // Photos carry the SAME snippet, because that scope text is what a future job needs to read when
      // one of these photos is the thing that matched. A filename would retrieve a hit nobody can act on.
      ...photos.map((photo) => ({
        kind: 'photo' as const,
        sourceId: photo.attachmentId,
        snippet,
        input: {
          kind: 'photo' as const,
          contentType: photo.contentType,
          dataBase64: photo.dataBase64,
        },
      })),
    ];
    return this.index.indexWorkItem(tenantId, jobId, pieces);
  }

  /**
   * Find past jobs resembling this job's scope. Excludes the job itself (it matches its own vector
   * perfectly) and anything below MIN_SIMILARITY, so a caller never has to decide what counts as evidence.
   */
  async findSimilarJobs(
    tenantId: string,
    jobId: string,
    scope: ScopeForComparison,
    limit = 5,
  ): Promise<SimilarJobMatch[]> {
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

  /**
   * Find past jobs resembling a NEW job's photos (card 60.5). A job being scoped for the first time has
   * photos but no scope, so scope-text retrieval has nothing to query with — the photos are the only
   * signal that exists at that moment.
   *
   * Each photo is searched separately and the hits folded together, so a job matched by any angle counts.
   */
  async findSimilarByPhotos(
    tenantId: string,
    jobId: string,
    photos: IndexablePhoto[],
    limit = 3,
  ): Promise<SimilarJobMatch[]> {
    if (photos.length === 0) return [];

    const perPhoto = await Promise.all(
      photos.map((photo) =>
        this.index.findSimilar(
          tenantId,
          { kind: 'photo', contentType: photo.contentType, dataBase64: photo.dataBase64 },
          { limit: Math.min(limit * 4, 50), excludeWorkItemId: jobId },
        ),
      ),
    );
    return foldToJobs(perPhoto.flat(), limit).filter((m) => m.similarity >= MIN_SIMILARITY);
  }
}
