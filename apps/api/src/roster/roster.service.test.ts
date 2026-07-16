import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { RosterService } from './roster.service';

function make() {
  const rows: Array<Record<string, unknown>> = [];
  const tx = {
    shift: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `s${rows.length + 1}`, notes: null, staffUserId: null, ...data };
        rows.push(row);
        return row;
      },
      findMany: async () => rows.slice().sort((a: any, b: any) => a.startsAt - b.startsAt),
      deleteMany: async ({ where }: { where: { id: string } }) => {
        const i = rows.findIndex((r) => r.id === where.id);
        if (i >= 0) rows.splice(i, 1);
        return { count: i >= 0 ? 1 : 0 };
      },
    },
  };
  const tenants = { runInTenant: (_t: string, fn: (tx: unknown) => unknown) => fn(tx) };
  return { svc: new RosterService(tenants as never), rows };
}

describe('RosterService', () => {
  it('adds a shift and lists it', async () => {
    const { svc } = make();
    const s = await svc.add('t1', {
      staffName: 'Alex',
      startsAt: '2026-07-11T09:00:00Z',
      endsAt: '2026-07-11T17:00:00Z',
    });
    expect(s.kind).toBe('shift');
    expect(await svc.list('t1')).toHaveLength(1);
  });

  it('supports time_off', async () => {
    const { svc } = make();
    const s = await svc.add('t1', {
      staffName: 'Alex',
      kind: 'time_off',
      startsAt: '2026-07-12T00:00:00Z',
      endsAt: '2026-07-13T00:00:00Z',
    });
    expect(s.kind).toBe('time_off');
  });

  it('rejects a blank name and a non-positive range', async () => {
    const { svc } = make();
    await expect(
      svc.add('t1', {
        staffName: '',
        startsAt: '2026-07-11T09:00:00Z',
        endsAt: '2026-07-11T17:00:00Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.add('t1', {
        staffName: 'Alex',
        startsAt: '2026-07-11T17:00:00Z',
        endsAt: '2026-07-11T09:00:00Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('removes a shift', async () => {
    const { svc } = make();
    const s = await svc.add('t1', {
      staffName: 'Alex',
      startsAt: '2026-07-11T09:00:00Z',
      endsAt: '2026-07-11T17:00:00Z',
    });
    await svc.remove('t1', s.id);
    expect(await svc.list('t1')).toHaveLength(0);
  });
});
