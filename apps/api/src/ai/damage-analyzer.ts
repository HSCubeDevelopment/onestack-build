/**
 * The AI gateway contract (Phase 2 flagship, slice A). A `DamageAnalyzer` turns a job's photos into a
 * proposed damage scope. Provider-abstracted on purpose: the real Anthropic Claude vision adapter runs
 * when a key is configured, and a deterministic stub runs otherwise (local dev, CI, tests) — so the whole
 * photo-to-quote flow works with NO external API in the MVP. Whatever an analyzer returns is an EDITABLE
 * DRAFT a human confirms; nothing here sends or orders anything.
 *
 * Cost caps live at THIS boundary (card: "cost caps + moderation"): the caller trims the photo set to
 * MAX_IMAGES before calling, and adapters cap their own output. Analyzers must be tenant-agnostic — they
 * only see the bytes handed to them, never the DB.
 */

/** An operation proposed for a panel. "replace" → a part line downstream; repair/paint → labour. */
export type DamageOperation = 'replace' | 'repair' | 'paint';
export const DAMAGE_OPERATIONS: readonly DamageOperation[] = [
  'replace',
  'repair',
  'paint',
] as const;

/** Cost cap: never send more than this many photos to an analyzer in one call. */
export const MAX_ANALYSIS_IMAGES = 6;

export interface DamageImage {
  /** e.g. 'image/jpeg' — a supported image MIME type. */
  contentType: string;
  /** Raw image bytes, base64-encoded (no data: prefix). */
  dataBase64: string;
}

/**
 * A past job of THIS shop's, retrieved as precedent (card 60.5). The point of grounding is that a
 * panel shop's own history is better evidence than a general prior: it already encodes how this shop
 * scopes work. Precedents are context for the draft, never an instruction — the analyzer may ignore
 * one that doesn't fit the photos, and a human still confirms whatever comes out.
 */
export interface DamagePrecedent {
  /** What that past job turned out to be, as indexed. */
  summary: string;
  /** 0..1 — how close it was judged to be. Shown to the model so it can weigh a weak match lightly. */
  similarity: number;
}

/** Cost cap: never ground a draft in more than this many past jobs. */
export const MAX_PRECEDENTS = 3;

export interface DamageAnalysisInput {
  images: DamageImage[];
  /** Optional free-text context from the job (customer description of the damage). */
  description?: string;
  /**
   * Similar past jobs to ground the draft in (card 60.5). Omitted or empty means an ungrounded draft —
   * which is the correct behaviour for a shop with no comparable history yet, not a degraded one.
   */
  precedents?: DamagePrecedent[];
}

/** One proposed line of the scope. Editable by a human before anything is priced. */
export interface DamageScopeItem {
  panel: string;
  operation: DamageOperation;
  note?: string;
  /** 0..1 — the analyzer's confidence. The stub emits plausible fixed values. */
  confidence?: number;
}

export interface DamageAnalysisResult {
  summary: string;
  items: DamageScopeItem[];
}

export interface DamageAnalyzer {
  /** Short identifier recorded on the scope for audit (e.g. 'stub' or the Claude model id). */
  readonly name: string;
  analyze(input: DamageAnalysisInput): Promise<DamageAnalysisResult>;
}

/** DI token for the configured analyzer (Anthropic when a key is set, stub otherwise). */
export const DAMAGE_ANALYZER = Symbol('DAMAGE_ANALYZER');
