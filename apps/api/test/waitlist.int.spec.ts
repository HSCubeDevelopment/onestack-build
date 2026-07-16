// Phase 4 — Waitlist & auto-fill (card #210). Add customers to the waitlist, find candidates to fill a
// freed slot, and confirm a candidate into a booking. Tenant-isolated.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { FeatureFlagService } from '../src/composition/feature-flag.service';
import { TenantService } from '../src/tenancy/tenant.service';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Waitlist & auto-fill (Phase 4)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let bayId: string;
  let entryId: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Wait A');
    b = await makeTenant(admin, 'Wait B');
    app = await createApp();
    await app.init();
    const flags = new FeatureFlagService(new TenantService());
    await flags.setEnabled(a.tenantId, 'scheduling', true);
    bayId = (
      await http()
        .post('/api/v1/resources')
        .set(auth(a))
        .send({ type: 'bay', name: 'Bay 1' })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      for (const tbl of [
        'onestack_waitlist_entry',
        'onestack_booking',
        'onestack_resource',
        'onestack_feature_flag',
      ]) {
        await admin.$executeRawUnsafe(`DELETE FROM "${tbl}" WHERE "tenantId" = $1::uuid`, t);
      }
    }
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  it('adds to the waitlist and lists who is waiting', async () => {
    entryId = (
      await http()
        .post('/api/v1/waitlist')
        .set(auth(a))
        .send({ name: 'Jane', phone: '0400000000', resourceId: bayId })
        .expect(201)
    ).body.id;
    const list = (await http().get('/api/v1/waitlist').set(auth(a)).expect(200)).body;
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe('waiting');
  });

  it('finds candidates for a freed resource slot', async () => {
    const cands = (
      await http().get(`/api/v1/waitlist?resourceId=${bayId}`).set(auth(a)).expect(200)
    ).body;
    expect(cands.some((c: { id: string }) => c.id === entryId)).toBe(true);
  });

  it('fills the slot: creates a booking and marks the entry booked', async () => {
    const res = (
      await http()
        .post(`/api/v1/waitlist/${entryId}/fill`)
        .set(auth(a))
        .send({
          resourceId: bayId,
          startsAt: '2027-02-10T09:00:00.000Z',
          endsAt: '2027-02-10T10:00:00.000Z',
        })
        .expect(201)
    ).body;
    expect(res.status).toBe('booked');
    expect(res.bookingId).toBeTruthy();
    // No longer waiting.
    expect((await http().get('/api/v1/waitlist').set(auth(a)).expect(200)).body).toHaveLength(0);
  });

  it("is tenant-isolated: shop B sees none of A's waitlist and can't fill A's entry", async () => {
    expect((await http().get('/api/v1/waitlist').set(auth(b)).expect(200)).body).toHaveLength(0);
    await http()
      .post(`/api/v1/waitlist/${entryId}/fill`)
      .set(auth(b))
      .send({
        resourceId: bayId,
        startsAt: '2027-02-11T09:00:00.000Z',
        endsAt: '2027-02-11T10:00:00.000Z',
      })
      .expect(404);
  });
});
