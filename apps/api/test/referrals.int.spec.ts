// Phase 4 — Referral engine (card #231). Issue a code, record a referral, convert + reward. Tenant-isolated.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Referral engine (Phase 4)', () => {
  let app: INestApplication; let admin: PrismaClient; let a: TestTenant; let b: TestTenant; let referrerId: string; let refId: string;
  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  beforeAll(async () => {
    admin = adminPrisma(); a = await makeTenant(admin, 'Ref A'); b = await makeTenant(admin, 'Ref B');
    app = await createApp(); await app.init();
    referrerId = (await http().post('/api/v1/contacts').set(auth(a)).send({ displayName: 'Jane', phone: '0400000000' }).expect(201)).body.id;
  });
  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) for (const tbl of ['onestack_referral','onestack_referral_code','onestack_contact'])
      await admin.$executeRawUnsafe(`DELETE FROM "${tbl}" WHERE "tenantId" = $1::uuid`, t);
    await dropTenant(admin, a.tenantId); await dropTenant(admin, b.tenantId); await admin.$disconnect();
  });

  it('issues a referral code for a customer', async () => {
    const c = (await http().post(`/api/v1/referrals/codes/${referrerId}`).set(auth(a)).expect(201)).body;
    expect(c.code).toMatch(/^REF-/);
    const again = (await http().post(`/api/v1/referrals/codes/${referrerId}`).set(auth(a)).expect(201)).body;
    expect(again.code).toBe(c.code);
  });

  it('records + converts + rewards a referral', async () => {
    refId = (await http().post('/api/v1/referrals').set(auth(a)).send({ referrerContactId: referrerId, referredName: 'Bob' }).expect(201)).body.id;
    await http().post(`/api/v1/referrals/${refId}/reward`).set(auth(a)).send({}).expect(400); // must convert first
    const conv = (await http().post(`/api/v1/referrals/${refId}/convert`).set(auth(a)).send({}).expect(201)).body;
    expect(conv.status).toBe('converted');
    const rew = (await http().post(`/api/v1/referrals/${refId}/reward`).set(auth(a)).send({ note: '500 pts' }).expect(201)).body;
    expect(rew.status).toBe('rewarded');
    expect((await http().get('/api/v1/referrals').set(auth(a)).expect(200)).body).toHaveLength(1);
  });

  it("is tenant-isolated: shop B sees none of A's referrals", async () => {
    expect((await http().get('/api/v1/referrals').set(auth(b)).expect(200)).body).toHaveLength(0);
    await http().post(`/api/v1/referrals/${refId}/convert`).set(auth(b)).send({}).expect(404);
  });
});
