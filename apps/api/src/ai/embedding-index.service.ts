import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { TenantClient, TenantService } from '../tenancy/tenant.service';
import {
  EMBEDDER,
  EmbedInput,
  Embedder,
  EmbeddingKind,
  MAX_EMBED_BATCH,
  toVectorLiteral,
} from './embedder';

/**
 * Card 60.3 — the embedding index. Turns a shop's finished jobs into searchable vectors so a NEW job's
 * photos and description can be matched against what this shop actually quoted before (card 60.4 does
 * the matching; card 60.5 feeds the matches to the drafting prompt).
 *
 * Every read and write goes through `runInTenant`, so a shop's pricing history stays behind RLS. pgvector
 * has no Prisma type, so the `embedding` column is handled with `$queryRaw`/`$executeRaw` — parameterised
 * tagged templates, never string concatenation.
 */

/** One indexable piece of a job, before it has been embedded. */
export interface IndexablePiece {
  kind: EmbeddingKind;
  /** The attachment/scope row this came from. Null for a piece with no stable source row. */
  sourceId: string | null;
  /** Short human-readable excerpt, stored so a retrieved hit can be explained rather than just scored. */
  snippet: string;
  /** What actually gets embedded. */
  input: EmbedInput;
}

export interface SimilarJob {
  workItemId: string;
  kind: EmbeddingKind;
  snippet: string;
  /** 0..1, higher is closer. Derived from cosine distance so callers never see raw distance. */
  similarity: number;
}

interface SimilarRow {
  workItemId: string;
  kind: EmbeddingKind;
  snippet: string;
  distance: number;
}

/** Hash what we embedded, so re-indexing an unchanged piece can skip the provider call entirely. */
function hashOf(input: EmbedInput): string {
  const content = input.kind === 'photo' ? input.dataBase64 : input.text;
  return createHash('sha256').update(`${input.kind}:${content}`).digest('hex');
}

@Injectable()
export class EmbeddingIndexService {
  constructor(
    private readonly tenants: TenantService,
    @Inject(EMBEDDER) private readonly embedder: Embedder,
  ) {}

  /**
   * Embed and store the given pieces of one job. Idempotent: a piece whose content hash already matches
   * what's stored is left alone, so re-indexing a job after adding one photo costs one embed, not N.
   *
   * Returns how many pieces were actually embedded (i.e. excludes the ones already up to date).
   */
  async indexWorkItem(
    tenantId: string,
    workItemId: string,
    pieces: IndexablePiece[],
  ): Promise<number> {
    if (pieces.length === 0) return 0;

    const stale = await this.tenants.runInTenant(tenantId, async (tx) => {
      const existing = await this.existingHashes(tx, workItemId);
      return pieces.filter((piece) => existing.get(this.pieceKey(piece)) !== hashOf(piece.input));
    });
    if (stale.length === 0) return 0;

    // Cost cap at the provider boundary, matching MAX_ANALYSIS_IMAGES on the vision side.
    const batch = stale.slice(0, MAX_EMBED_BATCH);
    const vectors = await this.embedder.embed(batch.map((piece) => piece.input));
    if (vectors.length !== batch.length) {
      throw new Error(
        `embedder returned ${vectors.length} vectors for ${batch.length} inputs — order would be ambiguous`,
      );
    }

    // Pair each piece with its vector up front, so the length check above is what guarantees
    // alignment — rather than re-deriving it by index inside the write loop.
    const embedded = batch.map((piece, i) => ({ piece, vector: vectors[i] ?? [] }));

    await this.tenants.runInTenant(tenantId, async (tx) => {
      for (const { piece, vector } of embedded) {
        await this.upsertPiece(tx, tenantId, workItemId, piece, vector);
      }
    });
    return batch.length;
  }

  /**
   * Find the pieces of PAST jobs most similar to a new one. Excludes the querying job itself — a job
   * always matches its own vectors perfectly, and surfacing that as a "similar past job" would be
   * circular. Returns a similarity in 0..1 so a caller can apply a confidence floor without knowing
   * that pgvector's `<=>` is a distance (lower = closer).
   */
  async findSimilar(
    tenantId: string,
    query: EmbedInput,
    opts: { limit?: number; excludeWorkItemId?: string } = {},
  ): Promise<SimilarJob[]> {
    const limit = Math.min(Math.max(opts.limit ?? 5, 1), 50);
    const [vector] = await this.embedder.embed([query]);
    if (!vector) throw new Error('embedder returned no vector for the query');
    const literal = toVectorLiteral(vector);
    const exclude = opts.excludeWorkItemId ?? null;

    const rows = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.$queryRaw<SimilarRow[]>`
        SELECT "workItemId", "kind", "snippet",
               ("embedding" <=> ${literal}::vector) AS distance
        FROM "onestack_job_embedding"
        WHERE (${exclude}::uuid IS NULL OR "workItemId" <> ${exclude}::uuid)
        ORDER BY "embedding" <=> ${literal}::vector
        LIMIT ${limit}`,
    );

    return rows.map((row) => ({
      workItemId: row.workItemId,
      kind: row.kind,
      snippet: row.snippet,
      // Cosine distance runs 0 (identical) → 2 (opposite); fold it into an intuitive 0..1 similarity.
      similarity: Math.max(0, Math.min(1, 1 - Number(row.distance) / 2)),
    }));
  }

  /** Drop a job's vectors — used when a job is deleted or its content is re-scoped from scratch. */
  async removeWorkItem(tenantId: string, workItemId: string): Promise<void> {
    await this.tenants.runInTenant(tenantId, (tx) =>
      tx.$executeRaw`DELETE FROM "onestack_job_embedding" WHERE "workItemId" = ${workItemId}::uuid`,
    );
  }

  // ------------------------------------------------------------------ internals

  /** `sourceId` is nullable, so key on the literal string 'null' rather than letting undefined collide. */
  private pieceKey(piece: { kind: EmbeddingKind; sourceId: string | null }): string {
    return `${piece.kind}:${piece.sourceId ?? 'null'}`;
  }

  private async existingHashes(
    tx: TenantClient,
    workItemId: string,
  ): Promise<Map<string, string>> {
    const rows = await tx.$queryRaw<
      { kind: EmbeddingKind; sourceId: string | null; contentHash: string }[]
    >`SELECT "kind", "sourceId", "contentHash"
      FROM "onestack_job_embedding"
      WHERE "workItemId" = ${workItemId}::uuid`;
    return new Map(rows.map((row) => [this.pieceKey(row), row.contentHash]));
  }

  private async upsertPiece(
    tx: TenantClient,
    tenantId: string,
    workItemId: string,
    piece: IndexablePiece,
    vector: number[],
  ): Promise<void> {
    const literal = toVectorLiteral(vector);
    const hash = hashOf(piece.input);

    // ON CONFLICT against the (tenantId, workItemId, kind, sourceId) unique index, so re-embedding a
    // changed photo replaces its vector instead of adding a second row that scores alongside the stale one.
    await tx.$executeRaw`
      INSERT INTO "onestack_job_embedding"
        ("tenantId", "workItemId", "kind", "sourceId", "contentHash", "snippet", "model", "embedding", "updatedAt")
      VALUES (
        ${tenantId}::uuid, ${workItemId}::uuid, ${piece.kind}, ${piece.sourceId}::uuid,
        ${hash}, ${piece.snippet}, ${this.embedder.name}, ${literal}::vector, now()
      )
      ON CONFLICT ("tenantId", "workItemId", "kind", "sourceId") DO UPDATE SET
        "contentHash" = EXCLUDED."contentHash",
        "snippet"     = EXCLUDED."snippet",
        "model"       = EXCLUDED."model",
        "embedding"   = EXCLUDED."embedding",
        "updatedAt"   = now()`;
  }
}
