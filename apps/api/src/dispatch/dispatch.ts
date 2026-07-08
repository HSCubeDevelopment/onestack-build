/**
 * Pure dispatch logic (Phase 3). No DB — cheap to unit test. Validates a dispatch status and groups job
 * cards by the technician they're routed to (the dispatch board).
 */

export type DispatchStatus = 'pending' | 'dispatched' | 'en_route' | 'on_site' | 'completed';
export const DISPATCH_STATUSES: readonly DispatchStatus[] = [
  'pending',
  'dispatched',
  'en_route',
  'on_site',
  'completed',
] as const;

export function isDispatchStatus(s: unknown): s is DispatchStatus {
  return typeof s === 'string' && (DISPATCH_STATUSES as readonly string[]).includes(s);
}

export interface DispatchJob {
  id: string;
  reference: string;
  stateName: string;
  customerName: string | null;
  vehicleLabel: string | null;
  assignees: string[];
  dispatchStatus: DispatchStatus;
  etaAt: string | null;
}

export interface DispatchLane {
  /** The technician (user id) this lane is for, or null for the unassigned lane. */
  assigneeUserId: string | null;
  jobs: DispatchJob[];
}

/**
 * Group jobs into per-technician lanes by their FIRST assignee (dispatch routes to one person), plus an
 * unassigned lane. Lanes are ordered: unassigned first, then technicians by id; jobs keep input order.
 */
export function groupByTechnician(jobs: DispatchJob[]): DispatchLane[] {
  const lanes = new Map<string | null, DispatchJob[]>();
  for (const job of jobs) {
    const tech = job.assignees[0] ?? null;
    const lane = lanes.get(tech);
    if (lane) lane.push(job);
    else lanes.set(tech, [job]);
  }
  const keys = [...lanes.keys()].sort((a, b) => {
    if (a === null) return -1;
    if (b === null) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return keys.map((assigneeUserId) => ({ assigneeUserId, jobs: lanes.get(assigneeUserId) ?? [] }));
}
