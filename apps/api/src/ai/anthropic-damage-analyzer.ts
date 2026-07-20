import Anthropic from '@anthropic-ai/sdk';
import {
  DAMAGE_OPERATIONS,
  DamageAnalysisInput,
  DamageAnalysisResult,
  DamageAnalyzer,
  DamageOperation,
  DamagePrecedent,
  DamageScopeItem,
  MAX_PRECEDENTS,
} from './damage-analyzer';

/** Image types the Claude vision API accepts. HEIC/HEIF phone photos are dropped (unsupported upstream). */
const VISION_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

/**
 * Render retrieved precedents into the prompt (card 60.5). Framed as evidence to weigh, not an answer
 * to copy: the photos are the source of truth, and a precedent that doesn't match them should be
 * ignored. Similarity is shown so a weak match can be discounted rather than trusted equally.
 */
export function renderPrecedents(precedents: DamagePrecedent[] | undefined): string {
  if (!precedents?.length) return '';
  const lines = precedents
    .slice(0, MAX_PRECEDENTS)
    .map((p) => `- (${Math.round(p.similarity * 100)}% similar) ${p.summary}`)
    .join('\n');
  return (
    "Similar jobs this shop has done before, most similar first. Use them to match this shop's usual " +
    'scoping where the photos agree, and ignore any that do not fit what you can see:\n' +
    `${lines}\n\n`
  );
}

const SYSTEM = [
  'You are a panel-beating estimator assistant. From photos of vehicle damage you propose an initial',
  'damage scope: which panels are affected and, for each, whether it should be replaced, repaired, or',
  'painted. Be conservative — this is a DRAFT a human estimator reviews and edits; nothing you output is',
  'ordered or sent. Only report damage you can actually see. Do not invent panels.',
].join(' ');

/** The exact JSON shape we ask Claude to return. Parsed from the text block. */
interface RawScope {
  summary?: unknown;
  items?: unknown;
}

/**
 * Real AI adapter — Anthropic Claude vision (Phase 2 flagship, slice A). Used only when ANTHROPIC_API_KEY
 * is set; otherwise the deterministic stub runs. Data stays in-region: the SDK talks to Anthropic over
 * HTTPS and we send only the photo bytes + a short instruction, no tenant identifiers.
 *
 * Model defaults to claude-opus-4-8 and is overridable with AI_SCOPE_MODEL. Output is capped (max_tokens)
 * and the image set is already trimmed by the caller (MAX_ANALYSIS_IMAGES) — the cost caps the card asks
 * for. We ask for JSON-only and parse it; a refusal or unparseable reply surfaces as an error the caller
 * turns into a clean failure rather than a bad draft.
 */
export class AnthropicDamageAnalyzer implements DamageAnalyzer {
  readonly name: string;
  private readonly client: Anthropic;

  constructor(apiKey: string, model = process.env.AI_SCOPE_MODEL || 'claude-opus-4-8') {
    this.client = new Anthropic({ apiKey });
    this.name = model;
  }

  async analyze(input: DamageAnalysisInput): Promise<DamageAnalysisResult> {
    const images = input.images.filter((i) => VISION_MEDIA_TYPES.has(i.contentType));
    if (images.length === 0) {
      throw new Error('No analyzable images (only JPEG/PNG/WebP/GIF are supported by vision)');
    }

    const content: Anthropic.ContentBlockParam[] = images.map((img) => ({
      type: 'image',
      source: {
        type: 'base64',
        media_type: img.contentType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        data: img.dataBase64,
      },
    }));
    content.push({
      type: 'text',
      text:
        (input.description ? `Customer note: ${input.description}\n\n` : '') +
        renderPrecedents(input.precedents) +
        'Propose the damage scope for this vehicle. Respond with ONLY a JSON object, no prose, of the ' +
        'form: {"summary": string, "items": [{"panel": string, "operation": "replace"|"repair"|"paint", ' +
        '"note": string, "confidence": number between 0 and 1}]}.',
    });

    const response = await this.client.messages.create({
      model: this.name,
      max_tokens: 4096,
      system: SYSTEM,
      messages: [{ role: 'user', content }],
    });

    if (response.stop_reason === 'refusal') {
      throw new Error('AI declined to analyze these photos');
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    return parseScope(text);
  }
}

/** Pull the first JSON object out of the reply and coerce it into a clean, validated result. Exported for unit tests. */
export function parseScope(text: string): DamageAnalysisResult {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('AI returned an unparseable damage scope');
  }
  let raw: RawScope;
  try {
    raw = JSON.parse(text.slice(start, end + 1)) as RawScope;
  } catch {
    throw new Error('AI returned invalid JSON for the damage scope');
  }

  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const items: DamageScopeItem[] = [];
  for (const entry of rawItems) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const panel = typeof e.panel === 'string' ? e.panel.trim() : '';
    const operation = e.operation as DamageOperation;
    if (!panel || !DAMAGE_OPERATIONS.includes(operation)) continue;
    items.push({
      panel,
      operation,
      note: typeof e.note === 'string' ? e.note.trim() : undefined,
      confidence: typeof e.confidence === 'number' ? clamp01(e.confidence) : undefined,
    });
  }
  if (items.length === 0) throw new Error('AI returned no usable damage items');

  return {
    summary: typeof raw.summary === 'string' ? raw.summary.trim() : '',
    items,
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
