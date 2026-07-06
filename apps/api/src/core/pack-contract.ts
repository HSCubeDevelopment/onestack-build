import { z } from 'zod';

/**
 * THE PACK CONTRACT (card #6.1). A vertical (automotive, physio, trades…) is a configuration PACK, never
 * a fork. This file is the written boundary: what a pack MAY declare, and — by omission — what it may not.
 *
 * A pack MAY add:
 *   - workItemTypes  (a unit-of-work type + its field schema + its workflow)
 *   - subjectTypes   ("the thing the work is about" — vehicle, property, case file — + field schema)
 *   - documents      (templates the core doesn't know about)
 *   - uiSlots        (contributions to named regions on core screens)
 *
 * A pack MUST NOT:
 *   - import core internals (services, Prisma, tenancy) — only this contract module + zod/@xstate.
 *   - read/write core tables directly, or touch another pack's data.
 *   - embed scripting/expressions in a workflow — states/guards/actions/transitions ONLY (guards/actions
 *     are referenced by NAME and implemented as pack code, never inline in the definition data).
 *
 * "Packs don't modify core" is enforced by an architecture test (src/core/pack-boundary.test.ts).
 */

/** Guard/action references are names; implementations are provided by the pack (not inline in data). */
export interface WorkflowContext {
  fields: Record<string, unknown>;
}
export interface WorkflowEventMeta {
  type: string;
}
export type GuardFn = (ctx: WorkflowContext, event: WorkflowEventMeta) => boolean;

export interface WorkflowTransitionDef {
  target: string;
  /** name of a guard provided by the pack (optional). */
  guard?: string;
  /** names of side-effect actions, fired as events (optional). */
  actions?: string[];
}
export interface WorkflowStateDef {
  on?: Record<string, WorkflowTransitionDef>;
  final?: boolean;
}
/** Pure DATA — no expressions, no scripting. Versioned; in-flight items pin to their version. */
export interface WorkflowDefinition {
  workItemType: string;
  version: number;
  initial: string;
  states: Record<string, WorkflowStateDef>;
}

export interface WorkItemTypeDef {
  type: string;
  label: string;
  fields: z.ZodTypeAny; // validates the Work Item's JSONB `fields`
  workflow: WorkflowDefinition;
  guards?: Record<string, GuardFn>;
}

export interface SubjectTypeDef {
  type: string;
  label: string;
  fields: z.ZodTypeAny; // validates the Subject's JSONB `fields`
}

export interface DocumentTemplateDef {
  key: string;
  label: string;
  body: string; // a template the core has no knowledge of
}

export interface UiSlotContribution {
  slot: string;
  component: string;
}

/** A relabelling of one core concept for a vertical (card #6.6). */
export interface TerminologyTerm {
  label: string;
  plural: string;
}
/** concept key (e.g. "work_item", "contact", "subject") → its vertical label. */
export type TerminologyMap = Record<string, TerminologyTerm>;

export interface Pack {
  id: string;
  label: string;
  workItemTypes?: WorkItemTypeDef[];
  subjectTypes?: SubjectTypeDef[];
  documents?: DocumentTemplateDef[];
  uiSlots?: UiSlotContribution[];
  /** Overrides the labels shown for core concepts (card #6.6). Missing terms fall back to the default. */
  terminology?: TerminologyMap;
}
