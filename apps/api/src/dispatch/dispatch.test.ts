// Unit tests for the pure dispatch logic (Phase 3). No DB.
import { describe, expect, it } from 'vitest';
import { DispatchJob, groupByTechnician, isDispatchStatus } from './dispatch';

const job = (id: string, assignees: string[]): DispatchJob => ({
  id,
  reference: `J-${id}`,
  stateName: 'InProgress',
  customerName: 'C',
  vehicleLabel: 'V',
  assignees,
  dispatchStatus: 'pending',
  etaAt: null,
});

describe('isDispatchStatus', () => {
  it('accepts known statuses and rejects others', () => {
    expect(isDispatchStatus('en_route')).toBe(true);
    expect(isDispatchStatus('completed')).toBe(true);
    expect(isDispatchStatus('flying')).toBe(false);
    expect(isDispatchStatus(5)).toBe(false);
  });
});

describe('groupByTechnician', () => {
  it('groups jobs by first assignee, unassigned lane first', () => {
    const lanes = groupByTechnician([
      job('1', ['tech-b']),
      job('2', []),
      job('3', ['tech-a']),
      job('4', ['tech-b']),
    ]);
    expect(lanes.map((l) => l.assigneeUserId)).toEqual([null, 'tech-a', 'tech-b']);
    expect(lanes[2]?.jobs.map((j) => j.id)).toEqual(['1', '4']); // tech-b keeps input order
    expect(lanes[0]?.jobs.map((j) => j.id)).toEqual(['2']); // unassigned
  });

  it('is empty for no jobs', () => {
    expect(groupByTechnician([])).toEqual([]);
  });
});
