import {
  DamageAnalysisInput,
  DamageAnalysisResult,
  DamageAnalyzer,
  DamageScopeItem,
  MAX_ANALYSIS_IMAGES,
} from './damage-analyzer';

/**
 * Deterministic fallback analyzer (no external API). Runs when ANTHROPIC_API_KEY is unset — local dev,
 * CI, and tests. It does NOT look at pixels; it produces a plausible, stable scope sized to how many
 * photos were supplied, so the rest of the photo-to-quote flow (parts list, priced quote) can be built
 * and tested end-to-end without a vendor. Output is still a draft a human edits — same contract as the
 * real adapter. Same input always yields the same scope (no randomness → repeatable tests).
 */

/** A short catalogue of common panels, in the order a real estimate tends to grow. */
const PANELS: { panel: string; operation: DamageScopeItem['operation']; note: string }[] = [
  { panel: 'Front bumper', operation: 'replace', note: 'Cracked; replacement recommended' },
  { panel: 'Bonnet', operation: 'repair', note: 'Dent — repair and refinish' },
  { panel: 'Front left guard', operation: 'paint', note: 'Scuffed — blend and paint' },
  { panel: 'Front left headlight', operation: 'replace', note: 'Housing broken' },
  { panel: 'Front left door', operation: 'repair', note: 'Minor crease' },
  { panel: 'Windscreen', operation: 'replace', note: 'Chipped in driver line of sight' },
];

export class StubDamageAnalyzer implements DamageAnalyzer {
  readonly name = 'stub';

  async analyze(input: DamageAnalysisInput): Promise<DamageAnalysisResult> {
    // One proposed panel per photo (capped), so more photos → a bigger scope. At least one line.
    const count = Math.min(Math.max(input.images.length, 1), PANELS.length, MAX_ANALYSIS_IMAGES);
    const items: DamageScopeItem[] = PANELS.slice(0, count).map((p) => ({
      panel: p.panel,
      operation: p.operation,
      note: p.note,
      confidence: 0.6,
    }));
    const summary =
      `Draft damage scope from ${input.images.length} photo(s): ${items.length} panel(s) proposed. ` +
      `Review and edit before pricing — nothing is ordered.`;
    return { summary, items };
  }
}
