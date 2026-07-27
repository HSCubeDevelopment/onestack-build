/**
 * Estimate flags (photo-to-quote Stage 6/7). Pure; no DB, no Nest, no network.
 *
 * Turns a damage scope into the two things a human estimator needs alongside the numbers:
 *   - confidence flags — lines the AI wasn't sure about, so they get a second look;
 *   - supplementary flags — panels that commonly hide further damage ("expect a supplementary");
 *   - escalation — STRUCTURAL damage (chassis/rails/pillars) that must NOT be auto-approved: it needs a
 *     manager/assessor sign-off and may be a total loss.
 *
 * These never change a price. They surface judgement calls so the estimator makes them deliberately.
 */
import { DamageOperation } from './damage-analyzer';

export type FlagLevel = 'info' | 'warn' | 'critical';

export interface EstimateFlag {
  level: FlagLevel;
  code: 'low_confidence' | 'supplementary' | 'structural';
  message: string;
}

export interface FlagInput {
  panel: string;
  operation: DamageOperation;
  confidence?: number;
}

/** Panels whose names signal STRUCTURAL damage — the escalation trigger. Substring match, lower-cased. */
const STRUCTURAL = [
  'chassis',
  'rail',
  'pillar',
  'firewall',
  'strut tower',
  'shock tower',
  'subframe',
  'sub frame',
  'cross member',
  'crossmember',
  'floor pan',
  'floorpan',
  'apron',
  'radiator support',
  'cant rail',
  'sill',
  'rocker',
];

/** Panels that commonly conceal further damage — flag a likely supplementary. */
const HIDDEN_RISK = [
  'bumper',
  'guard',
  'fender',
  'quarter',
  'grille',
  'bonnet',
  'hood',
  'headlight',
];

/** Below this the AI is telling us it's guessing — surface it for review. */
const LOW_CONFIDENCE = 0.6;

const list = (items: FlagInput[]): string => items.map((i) => i.panel).join(', ');

/**
 * Derive flags from a scope. `escalate` is true when anything critical (structural) is present — the
 * signal a UI uses to block a quiet approval and route to a human.
 */
export function estimateFlags(items: FlagInput[]): { flags: EstimateFlag[]; escalate: boolean } {
  const flags: EstimateFlag[] = [];

  const structural = items.filter((i) => STRUCTURAL.some((s) => i.panel.toLowerCase().includes(s)));
  if (structural.length > 0) {
    flags.push({
      level: 'critical',
      code: 'structural',
      message: `Structural damage (${list(structural)}) — needs a manager or assessor sign-off and may be a total loss. Do not auto-approve.`,
    });
  }

  const lowConf = items.filter(
    (i) => typeof i.confidence === 'number' && i.confidence < LOW_CONFIDENCE,
  );
  if (lowConf.length > 0) {
    flags.push({
      level: 'warn',
      code: 'low_confidence',
      message: `The AI is unsure about ${lowConf.length} line${lowConf.length === 1 ? '' : 's'} (${list(lowConf)}) — check these against the car.`,
    });
  }

  const supplementary = items.filter(
    (i) =>
      (i.operation === 'replace' || i.operation === 'repair') &&
      HIDDEN_RISK.some((h) => i.panel.toLowerCase().includes(h)),
  );
  if (supplementary.length > 0) {
    flags.push({
      level: 'info',
      code: 'supplementary',
      message: `Expect possible hidden damage behind ${list(supplementary)} — allow for a supplementary.`,
    });
  }

  return { flags, escalate: flags.some((f) => f.level === 'critical') };
}
