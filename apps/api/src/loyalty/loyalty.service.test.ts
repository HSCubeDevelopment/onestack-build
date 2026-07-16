import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { LoyaltyService } from './loyalty.service';

function make() {
  const accounts: any[] = [];
  const ltxns: any[] = [];
  const cards: any[] = [];
  const ctxns: any[] = [];
  const tx = {
    loyaltyAccount: {
      findFirst: async ({ where }: any) =>
        accounts.find((a) => a.contactId === where.contactId) ?? null,
      create: async ({ data }: any) => {
        const r = { id: `a${accounts.length + 1}`, ...data };
        accounts.push(r);
        return r;
      },
      update: async ({ where, data }: any) => {
        const r = accounts.find((a) => a.id === where.id);
        Object.assign(r, data);
        return r;
      },
    },
    loyaltyTxn: {
      create: async ({ data }: any) => {
        const r = { id: `lt${ltxns.length + 1}`, createdAt: new Date(), note: null, ...data };
        ltxns.push(r);
        return r;
      },
      findMany: async ({ where }: any) => ltxns.filter((t) => t.contactId === where.contactId),
    },
    giftCard: {
      findFirst: async ({ where }: any) =>
        cards.find((c) => (where.id ? c.id === where.id : c.code === where.code)) ?? null,
      create: async ({ data }: any) => {
        const r = {
          id: `gc${cards.length + 1}`,
          status: 'active',
          note: null,
          createdAt: new Date(),
          ...data,
        };
        cards.push(r);
        return r;
      },
      findMany: async () => cards,
      update: async ({ where, data }: any) => {
        const r = cards.find((c) => c.id === where.id);
        Object.assign(r, data);
        return r;
      },
    },
    giftCardTxn: {
      create: async ({ data }: any) => {
        ctxns.push(data);
        return data;
      },
    },
  };
  const tenants = { runInTenant: (_t: string, fn: (tx: unknown) => unknown) => fn(tx) };
  return { svc: new LoyaltyService(tenants as never), ctxns };
}

describe('LoyaltyService — points', () => {
  it('earns and redeems points, blocking overdraw', async () => {
    const { svc } = make();
    let acc = await svc.adjustPoints('t1', 'c1', 100, 'earn');
    expect(acc.points).toBe(100);
    acc = await svc.adjustPoints('t1', 'c1', -40, 'redeem');
    expect(acc.points).toBe(60);
    await expect(svc.adjustPoints('t1', 'c1', -1000)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.adjustPoints('t1', 'c1', 0)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('LoyaltyService — gift cards', () => {
  it('issues, redeems and voids a gift card', async () => {
    const { svc } = make();
    const gc = await svc.issueGiftCard('t1', { initialCents: 5000 });
    expect(gc.balanceCents).toBe(5000);
    expect(gc.code).toMatch(/^GC-/);
    const after = await svc.redeemGiftCard('t1', gc.id, 2000);
    expect(after.balanceCents).toBe(3000);
    await expect(svc.redeemGiftCard('t1', gc.id, 9999)).rejects.toBeInstanceOf(BadRequestException);
    const voided = await svc.voidGiftCard('t1', gc.id);
    expect(voided.status).toBe('void');
    await expect(svc.redeemGiftCard('t1', gc.id, 100)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('404s redeeming a missing card', async () => {
    const { svc } = make();
    await expect(svc.redeemGiftCard('t1', 'nope', 100)).rejects.toBeInstanceOf(NotFoundException);
  });
});
