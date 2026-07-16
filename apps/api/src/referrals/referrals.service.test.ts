import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ReferralsService } from './referrals.service';

function make() {
  const codes: any[] = [];
  const refs: any[] = [];
  const tx = {
    referralCode: {
      findFirst: async ({ where }: any) =>
        codes.find((c) => c.contactId === where.contactId) ?? null,
      create: async ({ data }: any) => {
        const r = { id: `rc${codes.length + 1}`, ...data };
        codes.push(r);
        return r;
      },
    },
    referral: {
      // The fake stands in for Postgres, so it has to apply the column defaults the service relies on —
      // `status` is DEFAULT 'pending' in the schema and never written by create(). Without it the row
      // comes back status: undefined, which the real DB would never do.
      create: async ({ data }: any) => {
        const r = {
          id: `r${refs.length + 1}`,
          referredPhone: null,
          referredContactId: null,
          rewardNote: null,
          status: 'pending',
          createdAt: new Date(),
          ...data,
        };
        refs.push(r);
        return r;
      },
      findFirst: async ({ where }: any) => refs.find((r) => r.id === where.id) ?? null,
      findMany: async () => refs,
      update: async ({ where, data }: any) => {
        const r = refs.find((x) => x.id === where.id);
        Object.assign(r, data);
        return r;
      },
    },
  };
  const tenants = { runInTenant: (_t: string, fn: (tx: unknown) => unknown) => fn(tx) };
  return { svc: new ReferralsService(tenants as never) };
}

describe('ReferralsService', () => {
  it('issues a stable code (same on repeat)', async () => {
    const { svc } = make();
    const c1 = await svc.ensureCode('t1', 'c1');
    expect(c1.code).toMatch(/^REF-/);
    const c2 = await svc.ensureCode('t1', 'c1');
    expect(c2.code).toBe(c1.code);
  });

  it('tracks a referral pending → converted → rewarded', async () => {
    const { svc } = make();
    const r = await svc.create('t1', { referrerContactId: 'c1', referredName: 'Bob' });
    expect(r.status).toBe('pending');
    await expect(svc.reward('t1', r.id)).rejects.toBeInstanceOf(BadRequestException);
    const conv = await svc.convert('t1', r.id, 'c2');
    expect(conv.status).toBe('converted');
    expect(conv.referredContactId).toBe('c2');
    const rew = await svc.reward('t1', r.id, 'Gave 500 pts');
    expect(rew.status).toBe('rewarded');
    expect(rew.rewardNote).toBe('Gave 500 pts');
  });

  it('rejects a blank name and 404s a missing referral', async () => {
    const { svc } = make();
    await expect(
      svc.create('t1', { referrerContactId: 'c1', referredName: '' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.convert('t1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
