// Card #3 + #4 end-to-end through the real HTTP stack: guard → tenant txn → RLS → DB.
// "Users log into their tenant only" + "roles gate what each user can see/do".
//
// Since the employee (STAFF) role landed, RolesGuard is DENY-BY-DEFAULT: an undecorated route is
// OWNER-only, and the worker surface is an explicit @AllowStaff() allowlist. Employees DO have full CRUD
// over the customer book (intake is their job) — what stays owner-only is the money, the whole-shop
// board, and admin operations like merging duplicates.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('auth + RBAC (HTTP)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  // A job in the automotive pack requires a customer (`fields.customerId`) and a subject
  // (`requiresSubject: true` → the car). Creating one without both is a 400, so these are set up once
  // and reused by every job this spec makes.
  let customerId: string;
  let vehicleId: string;

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'RBAC A');
    b = await makeTenant(admin, 'RBAC B');
    app = await createApp();
    await app.init();

    customerId = (
      await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .set('Authorization', `Bearer ${a.ownerToken}`)
        .send({ displayName: 'RBAC Customer', phone: '0400111222' })
    ).body.id;
    vehicleId = (
      await request(app.getHttpServer())
        .post(`/api/v1/contacts/${customerId}/vehicles`)
        .set('Authorization', `Bearer ${a.ownerToken}`)
        .send({ rego: 'RBAC01', make: 'Mazda', model: '3', year: 2019 })
    ).body.id;
  });

  afterAll(async () => {
    await app.close();
    // dropTenant only clears contacts + memberships. This spec now creates jobs, their subject links
    // and a vehicle, so unwind those first — child-before-parent, or the deletes hit a foreign key.
    // Same order as job-card.int.spec.ts, which builds the same shapes.
    for (const t of [a.tenantId, b.tenantId]) {
      for (const table of [
        'onestack_work_item_subject',
        'onestack_work_item',
        'onestack_work_item_counter',
        'onestack_subject',
        'onestack_contact',
      ]) {
        await admin.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "tenantId" = $1::uuid`, t);
      }
    }
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  /** The minimum valid body for a job in this pack. Callers add `assignees` as the test needs. */
  const jobBody = (extra: Record<string, unknown> = {}) => ({
    type: 'job',
    fields: { customerId, description: 'RBAC fixture job' },
    subjectIds: [vehicleId],
    ...extra,
  });

  const http = () => request(app.getHttpServer());

  it('rejects unauthenticated requests', async () => {
    await http().get('/api/v1/contacts').expect(401);
  });

  it('creates and lists a contact within the caller tenant', async () => {
    await http()
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${a.ownerToken}`)
      .send({ displayName: 'Casey (A)', phone: '0400000000' })
      .expect(201);

    const res = await http()
      .get('/api/v1/contacts')
      .set('Authorization', `Bearer ${a.ownerToken}`)
      .expect(200);
    expect(res.body.map((c: { displayName: string }) => c.displayName)).toContain('Casey (A)');
  });

  it("does not leak another tenant's contacts over HTTP", async () => {
    const res = await http()
      .get('/api/v1/contacts')
      .set('Authorization', `Bearer ${b.ownerToken}`)
      .expect(200);
    expect(
      res.body.find((c: { displayName: string }) => c.displayName === 'Casey (A)'),
    ).toBeUndefined();
  });

  it('rejects unknown fields (input validation)', async () => {
    await http()
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${a.ownerToken}`)
      .send({ displayName: 'x', hacker: true })
      .expect(400);
  });

  it('gates an owner-only route by role', async () => {
    await http()
      .get('/api/v1/contacts/owner-only')
      .set('Authorization', `Bearer ${a.staffToken}`)
      .expect(403);
    await http()
      .get('/api/v1/contacts/owner-only')
      .set('Authorization', `Bearer ${a.ownerToken}`)
      .expect(200);
  });

  describe('employee (STAFF) surface', () => {
    it('denies STAFF an undecorated route — the business stays owner-only by default', async () => {
      // Nothing marks these @AllowStaff(), so the employee must not reach the money.
      await http()
        .get('/api/v1/dashboard/summary')
        .set('Authorization', `Bearer ${a.staffToken}`)
        .expect(403);
      await http()
        .get('/api/v1/price-book')
        .set('Authorization', `Bearer ${a.staffToken}`)
        .expect(403);
      await http().get('/api/v1/sales').set('Authorization', `Bearer ${a.staffToken}`).expect(403);
    });

    it('gives STAFF full CRUD over the customer book — intake is their job', async () => {
      const made = await http()
        .post('/api/v1/contacts')
        .set('Authorization', `Bearer ${a.staffToken}`)
        .send({ displayName: 'Walk-in (staff)', phone: '0400000001' })
        .expect(201);

      await http()
        .get('/api/v1/contacts')
        .set('Authorization', `Bearer ${a.staffToken}`)
        .expect(200);

      await http()
        .patch(`/api/v1/contacts/${made.body.id}`)
        .set('Authorization', `Bearer ${a.staffToken}`)
        .send({ phone: '0400000002' })
        .expect(200);

      // Adding the car at intake is part of the same job.
      await http()
        .post(`/api/v1/contacts/${made.body.id}/vehicles`)
        .set('Authorization', `Bearer ${a.staffToken}`)
        .send({ rego: 'STF001', make: 'Mazda', model: '3', year: 2019 })
        .expect(201);

      // Soft delete, so a worker's mistake is recoverable rather than destructive.
      await http()
        .delete(`/api/v1/contacts/${made.body.id}`)
        .set('Authorization', `Bearer ${a.staffToken}`)
        .expect(204);
    });

    it('still keeps the admin contact operations away from STAFF', async () => {
      // Merge repoints one customer's records onto another and soft-deletes the loser: admin, not intake.
      await http()
        .get('/api/v1/contacts/duplicates')
        .set('Authorization', `Bearer ${a.staffToken}`)
        .expect(403);
    });

    it('admits STAFF to their own time clock but not the all-staff summary', async () => {
      await http()
        .get('/api/v1/time-clock/status')
        .set('Authorization', `Bearer ${a.staffToken}`)
        .expect(200);
      await http()
        .get('/api/v1/time-clock/summary')
        .set('Authorization', `Bearer ${a.staffToken}`)
        .expect(403);
    });

    it('only ever returns jobs the employee is assigned to', async () => {
      // Two jobs: one assigned to our staff member, one to nobody.
      const mine = await http()
        .post('/api/v1/work-items')
        .set('Authorization', `Bearer ${a.ownerToken}`)
        .send(jobBody({ assignees: [a.staffUserId] }))
        .expect(201);
      const theirs = await http()
        .post('/api/v1/work-items')
        .set('Authorization', `Bearer ${a.ownerToken}`)
        .send(jobBody({ assignees: [] }))
        .expect(201);

      const staffList = await http()
        .get('/api/v1/work-items?type=job')
        .set('Authorization', `Bearer ${a.staffToken}`)
        .expect(200);
      const ids = staffList.body.map((w: { id: string }) => w.id);
      expect(ids).toContain(mine.body.id);
      expect(ids).not.toContain(theirs.body.id);

      // The owner still sees both.
      const ownerList = await http()
        .get('/api/v1/work-items?type=job')
        .set('Authorization', `Bearer ${a.ownerToken}`)
        .expect(200);
      const ownerIds = ownerList.body.map((w: { id: string }) => w.id);
      expect(ownerIds).toEqual(expect.arrayContaining([mine.body.id, theirs.body.id]));

      // Reading an unassigned job by id is a 404, not a 403 — an employee can't probe which ids exist.
      await http()
        .get(`/api/v1/work-items/${theirs.body.id}`)
        .set('Authorization', `Bearer ${a.staffToken}`)
        .expect(404);
      await http()
        .get(`/api/v1/work-items/${mine.body.id}`)
        .set('Authorization', `Bearer ${a.staffToken}`)
        .expect(200);
    });

    it("refuses to let an employee read another job's notes or raise parts against it", async () => {
      const theirs = await http()
        .post('/api/v1/work-items')
        .set('Authorization', `Bearer ${a.ownerToken}`)
        .send(jobBody({ assignees: [] }))
        .expect(201);

      await http()
        .get(`/api/v1/work-items/${theirs.body.id}/notes`)
        .set('Authorization', `Bearer ${a.staffToken}`)
        .expect(404);
      await http()
        .post(`/api/v1/work-items/${theirs.body.id}/material-requests`)
        .set('Authorization', `Bearer ${a.staffToken}`)
        .send({ lines: [{ description: 'bumper clip', quantity: 2 }] })
        .expect(404);
    });

    it('assigns a STAFF-created job to its creator, so it cannot vanish behind the scope', async () => {
      const created = await http()
        .post('/api/v1/work-items')
        .set('Authorization', `Bearer ${a.staffToken}`)
        .send(jobBody())
        .expect(201);
      expect(created.body.assignees).toEqual([a.staffUserId]);

      const list = await http()
        .get('/api/v1/work-items?type=job')
        .set('Authorization', `Bearer ${a.staffToken}`)
        .expect(200);
      expect(list.body.map((w: { id: string }) => w.id)).toContain(created.body.id);
    });

    it('will not let an employee assign themselves someone else’s job', async () => {
      const theirs = await http()
        .post('/api/v1/work-items')
        .set('Authorization', `Bearer ${a.ownerToken}`)
        .send(jobBody({ assignees: [] }))
        .expect(201);

      // The escalation this whole design hinges on: grant yourself a job, then read it "legitimately".
      await http()
        .post(`/api/v1/work-items/${theirs.body.id}/assign`)
        .set('Authorization', `Bearer ${a.staffToken}`)
        .send({ assignees: [a.staffUserId] })
        .expect(403);
      await http()
        .get(`/api/v1/work-items/${theirs.body.id}`)
        .set('Authorization', `Bearer ${a.staffToken}`)
        .expect(404);
    });
  });
});
