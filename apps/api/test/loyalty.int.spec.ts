// Phase 4 — Loyalty, rewards & gift cards (card #230). Points ledger per customer + gift-card balances. Tenant-isolated.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Loyalty & gift cards (Phase 4)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let contactId: string;
  let cardId: string;
  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Loy A');
    b = await makeTenant(admin, 'Loy B');
    app = await createApp();
    await app.init();
    contactId = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(a))
        .send({ displayName: 'Jane', phone: '0400000000' })
        .expect(201)
    ).body.id;
  });
  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId])
      for (const tbl of [
        'onestack_gift_card_txn',
        'onestack_gift_card',
        'onestack_loyalty_txn',
        'onestack_loyalty_account',
        'onestack_contact',
      ])
        await admin.$executeRawUnsafe(`DELETE FROM "${tbl}" WHERE "tenantId" = $1::uuid`, t);
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  it('earns and redeems points', async () => {
    let acc = (
      await http()
        .post(`/api/v1/loyalty/${contactId}/adjust`)
        .set(auth(a))
        .send({ delta: 100, reason: 'earn' })
        .expect(201)
    ).body;
    expect(acc.points).toBe(100);
    acc = (
      await http()
        .post(`/api/v1/loyalty/${contactId}/adjust`)
        .set(auth(a))
        .send({ delta: -30, reason: 'redeem' })
        .expect(201)
    ).body;
    expect(acc.points).toBe(70);
    await http()
      .post(`/api/v1/loyalty/${contactId}/adjust`)
      .set(auth(a))
      .send({ delta: -1000 })
      .expect(400);
    expect(
      (await http().get(`/api/v1/loyalty/${contactId}`).set(auth(a)).expect(200)).body.points,
    ).toBe(70);
  });

  it('issues, lists and redeems a gift card', async () => {
    cardId = (
      await http().post('/api/v1/gift-cards').set(auth(a)).send({ initialCents: 5000 }).expect(201)
    ).body.id;
    expect((await http().get('/api/v1/gift-cards').set(auth(a)).expect(200)).body).toHaveLength(1);
    const after = (
      await http()
        .post(`/api/v1/gift-cards/${cardId}/redeem`)
        .set(auth(a))
        .send({ amountCents: 2000 })
        .expect(201)
    ).body;
    expect(after.balanceCents).toBe(3000);
    await http()
      .post(`/api/v1/gift-cards/${cardId}/redeem`)
      .set(auth(a))
      .send({ amountCents: 999999 })
      .expect(400);
  });

  it("is tenant-isolated: shop B sees no gift cards and can't redeem A's", async () => {
    expect((await http().get('/api/v1/gift-cards').set(auth(b)).expect(200)).body).toHaveLength(0);
    await http()
      .post(`/api/v1/gift-cards/${cardId}/redeem`)
      .set(auth(b))
      .send({ amountCents: 100 })
      .expect(404);
  });
});
