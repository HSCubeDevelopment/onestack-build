// Unit tests for DispatchService with lightweight fakes (no DB). Exercises the service methods directly:
// setStatus (create + upsert), get (default-pending), and board (regroup by technician).
import { describe, expect, it } from 'vitest';
import { BoardService } from '../board/board.service';
import { TenantService } from '../tenancy/tenant.service';
import { WorkItemService } from '../work-items/work-item.service';
import { DispatchService } from './dispatch.service';

function makeService(opts: {
  dispatchRow?: Record<string, unknown> | null;
  dispatches?: Record<string, unknown>[];
  board?: unknown;
}) {
  const tx = {
    dispatch: {
      findFirst: async () => opts.dispatchRow ?? null,
      findMany: async () => opts.dispatches ?? [],
      create: async ({ data }: { data: Record<string, unknown> }) => ({
        ...data,
        updatedAt: new Date('2026-07-08T00:00:00.000Z'),
      }),
      update: async ({ data }: { data: Record<string, unknown> }) => ({
        workItemId: 'j1',
        ...opts.dispatchRow,
        ...data,
        updatedAt: new Date('2026-07-08T00:00:00.000Z'),
      }),
    },
  };
  const tenants = {
    runInTenant: async (_id: string, fn: (t: unknown) => Promise<unknown>) => fn(tx),
  } as unknown as TenantService;
  const boards = {
    getBoard: async () => opts.board ?? { columns: [] },
  } as unknown as BoardService;
  const workItems = { get: async () => ({}) } as unknown as WorkItemService;
  return new DispatchService(tenants, boards, workItems);
}

describe('DispatchService', () => {
  it('setStatus creates a dispatch row with the status + ETA', async () => {
    const svc = makeService({ dispatchRow: null });
    const view = await svc.setStatus(
      't',
      'j1',
      { status: 'en_route', etaAt: '2026-07-08T10:00:00.000Z' },
      'u1',
    );
    expect(view.status).toBe('en_route');
    expect(view.etaAt).toBe('2026-07-08T10:00:00.000Z');
    expect(view.updatedByUserId).toBe('u1');
  });

  it('setStatus rejects a bad status and a bad ETA', async () => {
    const svc = makeService({});
    await expect(svc.setStatus('t', 'j1', { status: 'nope' as never }, 'u1')).rejects.toThrow(
      /invalid dispatch status/i,
    );
    await expect(
      svc.setStatus('t', 'j1', { status: 'pending', etaAt: 'not-a-date' }, 'u1'),
    ).rejects.toThrow(/valid date/i);
  });

  it('get returns a default pending state when nothing is set', async () => {
    const svc = makeService({ dispatchRow: null });
    const view = await svc.get('t', 'j1');
    expect(view.status).toBe('pending');
    expect(view.etaAt).toBeNull();
  });

  it('board regroups the job-board cards by technician with dispatch status', async () => {
    const svc = makeService({
      dispatches: [{ workItemId: 'j1', status: 'on_site', etaAt: null }],
      board: {
        columns: [
          {
            state: 'InProgress',
            cards: [
              {
                id: 'j1',
                reference: 'J-1',
                customerName: 'C',
                vehicleLabel: 'V',
                assignees: ['tech-a'],
              },
              { id: 'j2', reference: 'J-2', customerName: 'D', vehicleLabel: 'W', assignees: [] },
            ],
          },
        ],
      },
    });
    const { lanes } = await svc.board('t');
    expect(lanes.map((l) => l.assigneeUserId)).toEqual([null, 'tech-a']);
    const techLane = lanes.find((l) => l.assigneeUserId === 'tech-a');
    expect(techLane?.jobs[0]?.dispatchStatus).toBe('on_site');
  });
});
