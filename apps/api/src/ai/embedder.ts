/**
 * The embedding gateway contract (Card 60.3). An `Embedder` turns a piece of a job — a photo, or the
 * text of its damage scope — into a vector, so a NEW job can be matched against what this shop actually
 * quoted before. Provider-abstracted for the same reason as `DamageAnalyzer`: a real vendor adapter runs
 * when a key is configured, and a deterministic stub runs otherwise (local dev, CI, tests) — so the whole
 * retrieval flow can be built and tested with NO external API.
 *
 * Note Anthropic has no embeddings endpoint; Claude handles the vision/reasoning half of photo-to-quote
 * (see `AnthropicDamageAnalyzer`) and a separate provider supplies vectors. Keeping that behind this port
 * is what stops the vendor choice leaking into the retrieval code.
 *
 * Embedders must be tenant-agnostic — they only ever see the content handed to them, never the DB.
 */

/** Vector width. Fixed, because the column is `vector(1024)` — changing it is a migration, not a config flag. */
export const EMBEDDING_DIMS = 1024;

/** Cost cap: never embed more than this many pieces in one call. */
export const MAX_EMBED_BATCH = 32;

/** What an embedded piece of a job is. `photo` carries image bytes; `scope` carries text. */
export type EmbeddingKind = 'photo' | 'scope';

export interface EmbedImageInput {
  kind: 'photo';
  /** e.g. 'image/jpeg' — a supported image MIME type. */
  contentType: string;
  /** Raw image bytes, base64-encoded (no data: prefix). */
  dataBase64: string;
}

export interface EmbedTextInput {
  kind: 'scope';
  text: string;
}

export type EmbedInput = EmbedImageInput | EmbedTextInput;

/** DI token — mirrors DAMAGE_ANALYZER, so the vendor choice is swapped in one place (ai.module.ts). */
export const EMBEDDER = Symbol('EMBEDDER');

export interface Embedder {
  /** Identifies which provider produced a vector — stored per row so a model change can trigger a reindex. */
  readonly name: string;
  /**
   * Embed a batch, returning one vector per input **in the same order**. Every vector is
   * `EMBEDDING_DIMS` long and L2-normalised, so cosine distance in Postgres is a plain dot product.
   */
  embed(inputs: EmbedInput[]): Promise<number[][]>;
}

/** Scale a vector to unit length. Cosine distance assumes this; skipping it silently distorts ranking. */
export function normalise(vector: number[]): number[] {
  let sumOfSquares = 0;
  for (const value of vector) sumOfSquares += value * value;
  const magnitude = Math.sqrt(sumOfSquares);
  // An all-zero vector has no direction to preserve — leave it rather than dividing by zero.
  if (magnitude === 0) return vector;
  return vector.map((value) => value / magnitude);
}

/** Render a vector in the literal form pgvector parses: `[0.1,0.2,...]`. */
export function toVectorLiteral(vector: number[]): string {
  if (vector.length !== EMBEDDING_DIMS) {
    throw new Error(`embedding must be ${EMBEDDING_DIMS} dims, got ${vector.length}`);
  }
  return `[${vector.join(',')}]`;
}
