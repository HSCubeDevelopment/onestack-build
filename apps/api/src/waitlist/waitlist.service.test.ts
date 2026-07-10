import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { WaitlistService } from './waitlist.service';

function make(opts?: { bookingCreate?: (t: string, i: unknown) => Promise<{ id: string }> }) {
  const rows: Array<Record<string, unknown>> = [];
  const tx = {
    waitlistEntry: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `w${rows.length + 1}`, status: 'waiting', bookingId: null, notes: null, contactId: null, resourceId: null, createdAt: new Date('2026-07-10T00:00:00Z'), ...data };
        rows.push(row);
        return row;
      },
      findFirst: async ({ where }: { where: { id: string } }) => rows.find((r) => r.id === where.id) ?? null,
      findMany: async ({ where }: { where: { status: string; OR?: unknown[] } }) =>
        rows.filter((r) => r.status === where.status),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const r = rows.find((x) => x.id === where.id)!;
        Object.assign(r, data);
        return r;
      },
      updateMany: async ({ where, data }: { where: { id: string; status?: string }; data: Record<string, unknown> }) => {
        const r = rows.find((x) => x.id === where.id && (!where.status || x.status === where.status));
        if (r) Object.assign(r, data);
        return { count: r ? 1 : 0 };
      },
    },
  };
  const tenants = { runInTenant: (_t: string, fn: (tx: unknown) => unknown) => fn(tx) };
  const bookings = { create: opts?.bookingCreate ?? (async () => ({ id: 'bk1' })) };
  const svc = new WaitlistService(tenants as never, bookings as never);
  return { svc, rows };
}

describe('WaitlistService', () => {
  it('adds a waiting entry and lists it', async () => {
    const { svc } = make();
    const e = await svc.add('t1', { name: 'Jane', phone: '0400000000' });
    expect(e.status).toBe('waiting');
    expect((await svc.list('t1'))).toHaveLength(1);
  });

  it('requires name + phone', async () => {
    const { svc } = make();
    await expect(svc.add('t1', { name: '', phone: '0400' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fills a waiting entry into a booking and marks it booked', async () => {
    const { svc } = make();
    const e = await svc.add('t1', { name: 'Jane', phone: '0400000000' });
    const filled = await svc.fill('t1', e.id, {
      resourceId: 'r1',
      startsAt: '2026-07-11T09:00:00Z',
      endsAt: '2026-07-11T10:00:00Z',
    });
    expect(filled.status).toBe('booked');
    expect(filled.bookingId).toBe('bk1');
  });

  it('cannot fill a non-waiting entry, or a missing one', async () => {
    const { svc } = make();
    const e = await svc.add('t1', { name: 'Jane', phone: '0400000000' });
    await svc.fill('t1', e.id, { resourceId: 'r1', startsAt: '2026-07-11T09:00:00Z', endsAt: '2026-07-11T10:00:00Z' });
    await expect(
      svc.fill('t1', e.id, { resourceId: 'r1', startsAt: '2026-07-11T09:00:00Z', endsAt: '2026-07-11T10:00:00Z' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.fill('t1', 'nope', { resourceId: 'r1', startsAt: '2026-07-11T09:00:00Z', endsAt: '2026-07-11T10:00:00Z' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('removing a waiting entry drops it from the list', async () => {
    const { svc } = make();
    const e = await svc.add('t1', { name: 'Jane', phone: '0400000000' });
    await svc.remove('t1', e.id);
    expect(await svc.list('t1')).toHaveLength(0);
  });
});
