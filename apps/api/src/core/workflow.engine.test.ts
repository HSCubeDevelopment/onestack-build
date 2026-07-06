import { beforeEach, describe, expect, it } from 'vitest';
import { automotivePack } from '../../test/fixtures/packs/automotive.pack';
import { physioPack } from '../../test/fixtures/packs/physio.pack';
import { PackRegistry } from './pack-registry';
import { WorkflowEngine, WorkflowError } from './workflow.engine';

describe('WorkflowEngine (#6.5)', () => {
  let registry: PackRegistry;
  let engine: WorkflowEngine;

  beforeEach(() => {
    registry = new PackRegistry();
    registry.register(automotivePack);
    registry.register(physioPack);
    engine = new WorkflowEngine(registry);
  });

  const job = () => registry.getWorkItemType('job').workflow;
  const appt = () => registry.getWorkItemType('appointment').workflow;

  it('makes a legal transition', () => {
    expect(engine.transition(job(), 'Booked', 'START', {}).nextState).toBe('InProgress');
  });

  it('rejects an illegal transition', () => {
    expect(() => engine.transition(job(), 'Booked', 'COLLECT', {})).toThrow(WorkflowError);
  });

  it('evaluates guards (blocked, then allowed) and returns actions', () => {
    expect(() => engine.transition(job(), 'Ready', 'COLLECT', { paid: false })).toThrow(
      WorkflowError,
    );
    const ok = engine.transition(job(), 'Ready', 'COLLECT', { paid: true });
    expect(ok.nextState).toBe('Collected');
    expect(ok.actions).toContain('notifyCollected');
  });

  it('rejects transitions out of a terminal state', () => {
    expect(() => engine.transition(job(), 'Collected', 'START', {})).toThrow(WorkflowError);
  });

  it('runs a totally different vertical flow with ZERO code delta (physio appointment)', () => {
    expect(engine.transition(appt(), 'Scheduled', 'COMPLETE', {}).nextState).toBe('Completed');
    expect(engine.transition(appt(), 'Scheduled', 'CANCEL', {}).nextState).toBe('Cancelled');
    expect(() => engine.transition(appt(), 'Scheduled', 'START', {})).toThrow(WorkflowError);
  });

  it('resolves version-pinned workflows independently', () => {
    // A pack ships v2 that removes START; v1 must remain resolvable for in-flight items.
    registry.addWorkflowVersion({
      workItemType: 'job',
      version: 2,
      initial: 'Booked',
      states: { Booked: { on: { CANCEL: { target: 'Cancelled' } } }, Cancelled: { final: true } },
    });
    // v1 still allows START…
    expect(engine.transition(registry.getWorkflow('job', 1), 'Booked', 'START', {}).nextState).toBe(
      'InProgress',
    );
    // …while v2 does not.
    expect(() => engine.transition(registry.getWorkflow('job', 2), 'Booked', 'START', {})).toThrow(
      WorkflowError,
    );
  });
});
