import { WorkflowDefinition } from '../core/pack-contract';

/**
 * Card 52.3 — pure pipeline assembly. No DB, no Nest; cheap to unit test.
 *
 * This is a view over the WORKFLOW ENGINE'S states, and it is generic on purpose: core must not know
 * that automotive goes Booked → InProgress → Ready → Collected. The stages come from the pack's own
 * workflow definition, so a physio pack's appointment pipeline renders through the same code with no
 * changes here.
 */

export interface PipelineStage {
  /** The workflow state name, exactly as the pack declares it. */
  name: string;
  /** Position in the flow, 0-based. Derived, not configured — see `orderStates`. */
  order: number;
  /** A state with no outgoing transitions: the work has left the pipeline. */
  isFinal: boolean;
  count: number;
}

export interface PipelineItem {
  id: string;
  reference: string;
  stateName: string;
  /** How long it has sat in this stage, in whole hours. See the caveat on `StuckRule`. */
  hoursInStage: number;
  /** Set when the item has been in its stage longer than the rule allows. */
  stuckReason: string | null;
}

export interface PipelineView {
  stages: PipelineStage[];
  items: PipelineItem[];
  /** Items flagged stuck, worst first — the "what needs a human today" list. */
  stuck: PipelineItem[];
}

/** Minimal shape this module needs from a work item; keeps it independent of WorkItemView. */
export interface PipelineInput {
  id: string;
  reference: string;
  stateName: string;
  updatedAt: Date;
}

/**
 * How long an item may sit in a stage before it is worth a human's attention.
 *
 * CAVEAT worth knowing: there is no state-transition history table, so "time in stage" is measured
 * from the work item's `updatedAt`. Any edit to the item — a note, a field change — resets that clock.
 * The effect is that this UNDER-reports stuck work rather than over-reports it, which is the safer
 * direction for an alert list: a false "all clear" on an item someone is actively touching is better
 * than crying wolf on every item that had a comment added. If it ever needs to be exact, the fix is a
 * transition-history table, not a cleverer heuristic here.
 */
export interface StuckRule {
  /** Applies to this state only; omit for the default. */
  state?: string;
  afterHours: number;
  reason: string;
}

/** Sensible defaults. A pack can override these later without touching this module. */
export const DEFAULT_STUCK_RULES: StuckRule[] = [
  { state: 'AwaitingParts', afterHours: 72, reason: 'Waiting on parts for over 3 days' },
  { state: 'Ready', afterHours: 48, reason: 'Ready but not collected for over 2 days' },
  { afterHours: 168, reason: 'No movement for over a week' },
];

/**
 * Order the workflow's states into a pipeline.
 *
 * Breadth-first from the initial state, following declared transitions. This means the order shown is
 * the order work actually flows, taken from the definition rather than a hand-maintained list that
 * would drift the moment a pack added a stage. States unreachable from `initial` (a mis-wired pack, or
 * a state only entered by an admin action) are appended at the end rather than dropped — showing an
 * orphan stage with a count is far better than silently hiding work.
 */
export function orderStates(def: WorkflowDefinition): { name: string; isFinal: boolean }[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const queue: string[] = [def.initial];

  while (queue.length > 0) {
    const name = queue.shift() as string;
    if (seen.has(name) || !def.states[name]) continue;
    seen.add(name);
    ordered.push(name);
    for (const t of Object.values(def.states[name].on ?? {})) {
      if (!seen.has(t.target)) queue.push(t.target);
    }
  }

  for (const name of Object.keys(def.states)) {
    if (!seen.has(name)) ordered.push(name);
  }

  return ordered.map((name) => ({
    name,
    // "Final" = nothing leaves. Read from the shape rather than trusting the optional `final` flag,
    // which packs forget to set; an explicit `final: true` still wins.
    isFinal:
      def.states[name]?.final === true || Object.keys(def.states[name]?.on ?? {}).length === 0,
  }));
}

/** Whole hours between two instants, floored, never negative. */
export function hoursBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 3_600_000));
}

/** The first rule that fires for this item, or null. State-specific rules beat the catch-all. */
export function stuckReasonFor(
  item: { stateName: string; hoursInStage: number },
  rules: StuckRule[] = DEFAULT_STUCK_RULES,
): string | null {
  const specific = rules.filter((r) => r.state === item.stateName);
  const general = rules.filter((r) => r.state === undefined);
  for (const rule of [...specific, ...general]) {
    if (item.hoursInStage >= rule.afterHours) return rule.reason;
  }
  return null;
}

/**
 * Build the pipeline view: every stage the pack declares (including empty ones), each item placed in
 * its stage, and the stuck list.
 *
 * Empty stages are kept deliberately — a stage with zero items is information ("nothing is in paint
 * today"), and dropping it would make the board's shape change under the user as work moves.
 */
export function buildPipeline(
  def: WorkflowDefinition,
  workItems: PipelineInput[],
  now: Date,
  rules: StuckRule[] = DEFAULT_STUCK_RULES,
): PipelineView {
  const items: PipelineItem[] = workItems.map((w) => {
    const hoursInStage = hoursBetween(w.updatedAt, now);
    return {
      id: w.id,
      reference: w.reference,
      stateName: w.stateName,
      hoursInStage,
      stuckReason: stuckReasonFor({ stateName: w.stateName, hoursInStage }, rules),
    };
  });

  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.stateName, (counts.get(item.stateName) ?? 0) + 1);

  const stages: PipelineStage[] = orderStates(def).map((s, order) => ({
    name: s.name,
    order,
    isFinal: s.isFinal,
    count: counts.get(s.name) ?? 0,
  }));

  // An item in a state the pack no longer declares still exists and still needs handling, so surface
  // it as its own stage rather than losing it. Happens after a pack edit that removed a state.
  for (const [state, count] of counts) {
    if (!stages.some((s) => s.name === state)) {
      stages.push({ name: state, order: stages.length, isFinal: false, count });
    }
  }

  return {
    stages,
    items,
    stuck: items
      .filter((i) => i.stuckReason !== null)
      .sort((a, b) => b.hoursInStage - a.hoursInStage),
  };
}
