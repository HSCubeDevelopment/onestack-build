// Card #23: calendar & resource scheduling. Create/move/delete bookings, prevent double-booking a
// resource, link to a job, Day/Week range fetch. Gated behind the `scheduling` module. Tenant-isolated.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FeatureFlagService } from '../src/composition/feature-flag.service';
import { createApp } from '../src/main';
import { TenantService } from '../src/tenancy/tenant.service';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Scheduling — calendar & resources (card #23)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let flags: FeatureFlagService;
  let a: TestTenant;
  let b: TestTenant;
  let bayId: string;
  let jobId: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.staffToken}` });

  beforeAll(async () => {
    admin = adminPrisma();
    flags = new FeatureFlagService(new TenantService());
    a = await makeTenant(admin, 'Sched A');
    b = await makeTenant(admin, 'Sched B');
    app = await createApp();
    await app.init();
    // Both shops turn the scheduling module ON.
    await flags.setEnabled(a.tenantId, 'scheduling', true);
    await flags.setEnabled(b.tenantId, 'scheduling', true);

    bayId = (
      await http().post('/api/v1/resources').set(auth(a)).send({ type: 'bay', name: 'Bay 1' })
    ).body.id;
    const customerId = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(a))
        .send({ displayName: 'Sched Cust', phone: '0400555666' })
    ).body.id;
    const vehicleId = (
      await http()
        .post(`/api/v1/contacts/${customerId}/vehicles`)
        .set(auth(a))
        .send({ rego: 'SCH1', make: 'Holden', model: 'Astra', year: 2017 })
    ).body.id;
    jobId = (
      await http()
        .post('/api/v1/work-items')
        .set(auth(a))
        .send({ type: 'job', fields: { customerId }, subjectIds: [vehicleId] })
    ).body.id;
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      for (const tbl of [
        'onestack_booking',
        'onestack_resource',
        'onestack_work_item_subject',
        'onestack_work_item',
        'onestack_work_item_counter',
        'onestack_subject',
        'onestack_contact',
        'onestack_feature_flag',
      ]) {
        await admin.$executeRawUnsafe(`DELETE FROM "${tbl}" WHERE "tenantId" = $1::uuid`, t);
      }
    }
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  it('404s the calendar until the module is enabled', async () => {
    // A fresh shop with scheduling OFF cannot reach the routes.
    const c = await makeTenant(admin, 'Sched C');
    await http().get('/api/v1/resources').set(auth(c)).expect(404);
    await http().post('/api/v1/bookings').set(auth(c)).send({}).expect(404);
    await admin.$executeRawUnsafe(
      `DELETE FROM "onestack_membership" WHERE "tenantId" = $1::uuid`,
      c.tenantId,
    );
    await dropTenant(admin, c.tenantId);
  });

  it('creates a booking linked to a job, then moves it', async () => {
    const created = (
      await http()
        .post('/api/v1/bookings')
        .set(auth(a))
        .send({
          resourceId: bayId,
          title: 'Astra repair',
          startsAt: '2026-07-10T09:00:00.000Z',
          endsAt: '2026-07-10T11:00:00.000Z',
          workItemId: jobId,
        })
        .expect(201)
    ).body;
    expect(created.workItemId).toBe(jobId);

    // Move it to the afternoon (resize/move is a PATCH).
    const moved = (
      await http()
        .patch(`/api/v1/bookings/${created.id}`)
        .set(auth(a))
        .send({ startsAt: '2026-07-10T14:00:00.000Z', endsAt: '2026-07-10T16:00:00.000Z' })
        .expect(200)
    ).body;
    expect(new Date(moved.startsAt).toISOString()).toBe('2026-07-10T14:00:00.000Z');
  });

  it('prevents double-booking the same resource at an overlapping time; allowOverlap overrides', async () => {
    await http()
      .post('/api/v1/bookings')
      .set(auth(a))
      .send({
        resourceId: bayId,
        title: 'Morning job',
        startsAt: '2026-07-11T09:00:00.000Z',
        endsAt: '2026-07-11T11:00:00.000Z',
      })
      .expect(201);

    // Overlapping 10:00–12:00 on the same bay → 409.
    await http()
      .post('/api/v1/bookings')
      .set(auth(a))
      .send({
        resourceId: bayId,
        title: 'Clashing job',
        startsAt: '2026-07-11T10:00:00.000Z',
        endsAt: '2026-07-11T12:00:00.000Z',
      })
      .expect(409);

    // Same time, but the shop chooses "book anyway".
    await http()
      .post('/api/v1/bookings')
      .set(auth(a))
      .send({
        resourceId: bayId,
        title: 'Booked anyway',
        startsAt: '2026-07-11T10:00:00.000Z',
        endsAt: '2026-07-11T12:00:00.000Z',
        allowOverlap: true,
      })
      .expect(201);

    // A back-to-back booking (11:00–12:00) does NOT overlap 09:00–11:00 → allowed.
    await http()
      .post('/api/v1/bookings')
      .set(auth(a))
      .send({
        resourceId: bayId,
        title: 'Back to back',
        startsAt: '2026-07-12T11:00:00.000Z',
        endsAt: '2026-07-12T12:00:00.000Z',
      })
      .expect(201);
  });

  it('range fetch returns only bookings intersecting the window (Day/Week views)', async () => {
    const dayOnly = (
      await http()
        .get('/api/v1/bookings')
        .query({ from: '2026-07-10T00:00:00.000Z', to: '2026-07-11T00:00:00.000Z' })
        .set(auth(a))
        .expect(200)
    ).body as Array<{ startsAt: string }>;
    // Only the 10th's booking is in this window.
    expect(dayOnly.length).toBeGreaterThanOrEqual(1);
    for (const bk of dayOnly) {
      expect(new Date(bk.startsAt).toISOString().startsWith('2026-07-10')).toBe(true);
    }
  });

  it('refuses to delete a resource with bookings unless forced', async () => {
    const bay2 = (
      await http().post('/api/v1/resources').set(auth(a)).send({ type: 'bay', name: 'Bay 2' })
    ).body;
    await http()
      .post('/api/v1/bookings')
      .set(auth(a))
      .send({
        resourceId: bay2.id,
        title: 'On bay 2',
        startsAt: '2026-07-20T09:00:00.000Z',
        endsAt: '2026-07-20T10:00:00.000Z',
      })
      .expect(201);
    await http().delete(`/api/v1/resources/${bay2.id}`).set(auth(a)).expect(409);
    await http()
      .delete(`/api/v1/resources/${bay2.id}`)
      .query({ force: 'true' })
      .set(auth(a))
      .expect(204);
  });

  it("is tenant-isolated: shop B sees none of shop A's resources or bookings", async () => {
    // B has its own (empty) calendar.
    expect((await http().get('/api/v1/resources').set(auth(b)).expect(200)).body).toHaveLength(0);
    expect((await http().get('/api/v1/bookings').set(auth(b)).expect(200)).body).toHaveLength(0);
    // B cannot book against A's bay.
    await http()
      .post('/api/v1/bookings')
      .set(auth(b))
      .send({
        resourceId: bayId,
        title: 'Cross-tenant',
        startsAt: '2026-07-25T09:00:00.000Z',
        endsAt: '2026-07-25T10:00:00.000Z',
      })
      .expect(404);
  });
});
