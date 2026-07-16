import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ReportingService } from './reporting.service';

const NOW = new Date('2026-07-08T00:00:00Z');
const DAY = 86_400_000;

const wi = (id: string, stateName: string, createdAt: Date, updatedAt: Date) => ({
  id,
  type: 'job',
  reference: id,
  stateName,
  workflowVersion: 1,
  assignees: [],
  fields: {},
  version: 1,
  createdAt,
  updatedAt,
});

function make(opts?: {
  jobs?: unknown[];
  received?: number;
  outstanding?: number;
  bookings?: unknown[];
  resources?: unknown[];
  finalStates?: string[];
}) {
  const workItems = { list: async () => opts?.jobs ?? [] };
  const invoices = {
    revenueSince: async () => opts?.received ?? 0,
    outstandingCents: async () => opts?.outstanding ?? 0,
  };
  const bookings = { list: async () => opts?.bookings ?? [] };
  const resources = { list: async () => opts?.resources ?? [] };
  const registry = {
    hasWorkItemType: () => true,
    getWorkItemType: () => ({
      workflow: {
        states: Object.fromEntries(
          (opts?.finalStates ?? ['collected']).map((s) => [s, { final: true }]),
        ),
      },
    }),
  };
  const svc = new ReportingService(
    workItems as never,
    invoices as never,
    bookings as never,
    resources as never,
    registry as never,
  );
  svc.now = () => NOW;
  return svc;
}

describe('ReportingService.overview', () => {
  it('composes revenue, jobs, turnaround and utilisation over the default 30 days', async () => {
    const svc = make({
      jobs: [
        wi(
          'j1',
          'in_progress',
          new Date(NOW.getTime() - 3 * DAY),
          new Date(NOW.getTime() - 1 * DAY),
        ),
        wi(
          'j2',
          'collected',
          new Date(NOW.getTime() - 10 * DAY),
          new Date(NOW.getTime() - 6 * DAY),
        ), // final → turnaround 4d
        wi(
          'j3',
          'collected',
          new Date(NOW.getTime() - 60 * DAY),
          new Date(NOW.getTime() - 58 * DAY),
        ), // final → 2d, created before period
      ],
      received: 250000,
      outstanding: 90000,
      bookings: [
        {
          startsAt: new Date(NOW.getTime() - 2 * DAY),
          endsAt: new Date(NOW.getTime() - 2 * DAY + 2 * 3600000),
        },
      ],
      resources: [{ id: 'r1' }, { id: 'r2' }],
      finalStates: ['collected'],
    });

    const r = await svc.overview('t1');
    expect(r.revenue).toEqual({ receivedCents: 250000, outstandingCents: 90000 });
    expect(r.jobs.total).toBe(3);
    expect(r.jobs.active).toBe(1); // only j1 is non-final
    expect(r.jobs.createdInPeriod).toBe(2); // j1, j2 within 30d; j3 is 60d ago
    expect(r.jobs.byState).toEqual({ in_progress: 1, collected: 2 });
    expect(r.turnaround.completedCount).toBe(2);
    expect(r.turnaround.averageDays).toBe(3); // (4 + 2) / 2
    expect(r.utilisation.resourceCount).toBe(2);
    expect(r.utilisation.bookedHours).toBe(2);
  });

  it('rejects an invalid or future from date', async () => {
    const svc = make();
    await expect(svc.overview('t1', 'not-a-date')).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.overview('t1', '2099-01-01T00:00:00Z')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('handles a shop with no data', async () => {
    const r = await make().overview('t1');
    expect(r.jobs.total).toBe(0);
    expect(r.turnaround.averageDays).toBeNull();
    expect(r.utilisation.utilisationPct).toBe(0);
  });
});
