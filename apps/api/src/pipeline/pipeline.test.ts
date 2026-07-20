import { describe, expect, it } from 'vitest';
import { WorkflowDefinition } from '../core/pack-contract';
import {
  buildPipeline,
  hoursBetween,
  orderStates,
  PipelineInput,
  stuckReasonFor,
} from './pipeline';

/** A deliberately un-automotive workflow, to prove core doesn't know about panel shops. */
const physio: WorkflowDefinition = {
  workItemType: 'appointment',
  version: 1,
  initial: 'Requested',
  states: {
    Requested: { on: { CONFIRM: { target: 'Confirmed' } } },
    Confirmed: { on: { ARRIVE: { target: 'InSession' } } },
    InSession: { on: { FINISH: { target: 'Completed' } } },
    Completed: {},
  },
};

const NOW = new Date('2026-07-20T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

const item = (id: string, stateName: string, h: number): PipelineInput => ({
  id,
  reference: `X-${id}`,
  stateName,
  updatedAt: hoursAgo(h),
});

describe('orderStates', () => {
  it('orders stages by the flow the pack declares, not alphabetically', () => {
    // The whole point: core reads the order out of the workflow instead of hard-coding stage names.
    expect(orderStates(physio).map((s) => s.name)).toEqual([
      'Requested',
      'Confirmed',
      'InSession',
      'Completed',
    ]);
  });

  it('marks a state with no way out as final', () => {
    const byName = Object.fromEntries(orderStates(physio).map((s) => [s.name, s.isFinal]));
    expect(byName.Completed).toBe(true);
    expect(byName.InSession).toBe(false);
  });

  it('respects an explicit final flag even when transitions exist', () => {
    const def: WorkflowDefinition = {
      ...physio,
      states: {
        ...physio.states,
        InSession: { final: true, on: { FINISH: { target: 'Completed' } } },
      },
    };
    expect(orderStates(def).find((s) => s.name === 'InSession')?.isFinal).toBe(true);
  });

  it('appends unreachable states instead of dropping them', () => {
    // A state only an admin action can enter would otherwise vanish — along with any work sitting in it.
    const def: WorkflowDefinition = {
      ...physio,
      states: { ...physio.states, Abandoned: {} },
    };
    const names = orderStates(def).map((s) => s.name);
    expect(names).toContain('Abandoned');
    expect(names.indexOf('Abandoned')).toBe(names.length - 1);
  });

  it('does not loop forever on a cyclic workflow', () => {
    // Panel shops really do bounce work backwards (Repair → AwaitingParts → Repair).
    const def: WorkflowDefinition = {
      workItemType: 'job',
      version: 1,
      initial: 'A',
      states: {
        A: { on: { GO: { target: 'B' } } },
        B: { on: { BACK: { target: 'A' }, ON: { target: 'C' } } },
        C: {},
      },
    };
    expect(orderStates(def).map((s) => s.name)).toEqual(['A', 'B', 'C']);
  });
});

describe('hoursBetween', () => {
  it('floors to whole hours', () => {
    expect(hoursBetween(hoursAgo(3), NOW)).toBe(3);
    expect(hoursBetween(new Date(NOW.getTime() - 90 * 60_000), NOW)).toBe(1);
  });

  it('never goes negative on a clock skew', () => {
    expect(hoursBetween(new Date(NOW.getTime() + 60_000), NOW)).toBe(0);
  });
});

describe('stuckReasonFor', () => {
  it('flags parts waiting past three days', () => {
    expect(stuckReasonFor({ stateName: 'AwaitingParts', hoursInStage: 73 })).toMatch(/parts/i);
  });

  it('does not flag the same state before its threshold', () => {
    expect(stuckReasonFor({ stateName: 'AwaitingParts', hoursInStage: 71 })).toBeNull();
  });

  it('prefers a state-specific rule over the catch-all', () => {
    // Ready trips at 48h; the generic rule is 168h. The specific reason is the useful one.
    expect(stuckReasonFor({ stateName: 'Ready', hoursInStage: 50 })).toMatch(/not collected/i);
  });

  it('falls back to the catch-all for a state with no rule', () => {
    expect(stuckReasonFor({ stateName: 'InProgress', hoursInStage: 200 })).toMatch(/over a week/i);
    expect(stuckReasonFor({ stateName: 'InProgress', hoursInStage: 100 })).toBeNull();
  });
});

describe('buildPipeline', () => {
  const items = [
    item('1', 'Requested', 1),
    item('2', 'Confirmed', 2),
    item('3', 'Confirmed', 300), // long enough to trip the catch-all
  ];

  it('counts items per stage', () => {
    const { stages } = buildPipeline(physio, items, NOW);
    const byName = Object.fromEntries(stages.map((s) => [s.name, s.count]));
    expect(byName).toEqual({ Requested: 1, Confirmed: 2, InSession: 0, Completed: 0 });
  });

  it('keeps empty stages', () => {
    // "Nothing is in session today" is information, and dropping empties would make the board's shape
    // shift under the user as work moves.
    const { stages } = buildPipeline(physio, [], NOW);
    expect(stages).toHaveLength(4);
    expect(stages.every((s) => s.count === 0)).toBe(true);
  });

  it('surfaces work sitting in a state the pack no longer declares', () => {
    const { stages } = buildPipeline(physio, [item('9', 'Removed', 1)], NOW);
    const orphan = stages.find((s) => s.name === 'Removed');
    expect(orphan?.count).toBe(1);
  });

  it('lists stuck items worst-first', () => {
    const { stuck } = buildPipeline(
      physio,
      [item('a', 'Confirmed', 200), item('b', 'Confirmed', 400), item('c', 'Confirmed', 1)],
      NOW,
    );
    expect(stuck.map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('reports hours in stage on every item', () => {
    const { items: out } = buildPipeline(physio, [item('1', 'Requested', 5)], NOW);
    expect(out[0]?.hoursInStage).toBe(5);
    expect(out[0]?.stuckReason).toBeNull();
  });
});
