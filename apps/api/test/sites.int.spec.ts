// SITE-1 — multi-site, end to end against Supabase.
// Proves: an owner manages a shop's sites; a job can be tagged with a site and filtered by it; the
// dashboard breaks active jobs down per location; STAFF can list sites but not manage them; and a job
// can never reference another tenant's site (RLS-scoped validation + tenant isolation).
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Multi-site (SITE-1)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  const http = () => request(app.getHttpServer());
  const ownerA = () => ({ Authorization: `Bearer ${a.ownerToken}` });
  const staffA = () => ({ Authorization: `Bearer ${a.staffToken}` });
  const ownerB = () => ({ Authorization: `Bearer ${b.ownerToken}` });

  // A customer + vehicle so we can create real jobs (the automotive "job" requires a customer + a
  // linked subject). Unique rego per call so repeated seeds in one tenant don't clash.
  let regoSeq = 0;
  async function seedCustomerVehicle(
    auth: () => Record<string, string>,
  ): Promise<{ customerId: string; vehicleId: string }> {
    const customerId = (
      await http()
        .post('/api/v1/contacts')
        .set(auth())
        .send({ displayName: 'Sitely', phone: '0400999888' })
    ).body.id;
    const rego = `SITE${String(++regoSeq).padStart(2, '0')}`;
    const vehicleId = (
      await http()
        .post(`/api/v1/contacts/${customerId}/vehicles`)
        .set(auth())
        .send({ rego, make: 'Kia', model: 'Cerato', year: 2019 })
    ).body.id;
    return { customerId, vehicleId };
  }

  async function createJob(
    auth: () => Record<string, string>,
    v: { customerId: string; vehicleId: string },
    siteId?: string,
  ): Promise<{ id: string; siteId: string | null; version: number }> {
    const res = await http()
      .post('/api/v1/work-items')
      .set(auth())
      .send({
        type: 'job',
        fields: { customerId: v.customerId },
        subjectIds: [v.vehicleId],
        ...(siteId ? { siteId } : {}),
      });
    if (res.status !== 201) throw new Error(`createJob ${res.status}: ${JSON.stringify(res.body)}`);
    return res.body;
  }

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Sites A');
    b = await makeTenant(admin, 'Sites B');
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      for (const table of [
        'onestack_work_item_subject',
        'onestack_work_item',
        'onestack_site',
        'onestack_subject',
        'onestack_contact',
        'onestack_work_item_counter',
        'onestack_reference_counter',
        'onestack_audit_log',
      ]) {
        await admin.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "tenantId" = $1::uuid`, t);
      }
      await dropTenant(admin, t);
    }
    await admin.$disconnect();
  });

  it('lets an OWNER manage sites; STAFF can list but not create', async () => {
    const north = (
      await http()
        .post('/api/v1/sites')
        .set(ownerA())
        .send({ name: 'Northside', code: 'NTH' })
        .expect(201)
    ).body;
    expect(north.name).toBe('Northside');
    expect(north.code).toBe('NTH');

    // Duplicate name is rejected.
    await http().post('/api/v1/sites').set(ownerA()).send({ name: 'Northside' }).expect(400);

    // STAFF can see the list…
    const listed = (await http().get('/api/v1/sites').set(staffA()).expect(200)).body;
    expect(listed.map((s: { name: string }) => s.name)).toContain('Northside');
    // …but cannot create/edit/delete.
    await http().post('/api/v1/sites').set(staffA()).send({ name: 'Sneaky' }).expect(403);
    await http()
      .patch(`/api/v1/sites/${north.id}`)
      .set(staffA())
      .send({ name: 'Nope' })
      .expect(403);
    await http().delete(`/api/v1/sites/${north.id}`).set(staffA()).expect(403);

    // Owner rename works.
    const renamed = (
      await http()
        .patch(`/api/v1/sites/${north.id}`)
        .set(ownerA())
        .send({ code: 'NOR' })
        .expect(200)
    ).body;
    expect(renamed.code).toBe('NOR');
  });

  it('tags a job with a site, filters by it, and can reassign / clear it', async () => {
    const v = await seedCustomerVehicle(ownerA);
    const north = (
      await http().post('/api/v1/sites').set(ownerA()).send({ name: 'Filter North' }).expect(201)
    ).body;
    const south = (
      await http().post('/api/v1/sites').set(ownerA()).send({ name: 'Filter South' }).expect(201)
    ).body;

    const jobN = await createJob(ownerA, v, north.id);
    const jobU = await createJob(ownerA, v); // unassigned
    expect(jobN.siteId).toBe(north.id);
    expect(jobU.siteId).toBeNull();

    // Filter to North → only the North job.
    const northJobs = (
      await http().get(`/api/v1/work-items?type=job&siteId=${north.id}`).set(ownerA()).expect(200)
    ).body;
    expect(northJobs.map((j: { id: string }) => j.id)).toEqual([jobN.id]);

    // Filter to "none" → the unassigned job is there, the North one isn't.
    const noneJobs = (
      await http().get('/api/v1/work-items?type=job&siteId=none').set(ownerA()).expect(200)
    ).body;
    const noneIds = noneJobs.map((j: { id: string }) => j.id);
    expect(noneIds).toContain(jobU.id);
    expect(noneIds).not.toContain(jobN.id);

    // Reassign the North job to South.
    const ver = (await http().get(`/api/v1/work-items/${jobN.id}`).set(ownerA()).expect(200)).body
      .version;
    const moved = (
      await http()
        .patch(`/api/v1/work-items/${jobN.id}`)
        .set(ownerA())
        .send({ siteId: south.id, expectedVersion: ver })
        .expect(200)
    ).body;
    expect(moved.siteId).toBe(south.id);

    // Clear it back to unassigned with null.
    const cleared = (
      await http()
        .patch(`/api/v1/work-items/${jobN.id}`)
        .set(ownerA())
        .send({ siteId: null, expectedVersion: moved.version })
        .expect(200)
    ).body;
    expect(cleared.siteId).toBeNull();
  });

  it('breaks active jobs down per site on the dashboard', async () => {
    const v = await seedCustomerVehicle(ownerA);
    const depot = (
      await http().post('/api/v1/sites').set(ownerA()).send({ name: 'Dash Depot' }).expect(201)
    ).body;
    await createJob(ownerA, v, depot.id);
    await createJob(ownerA, v, depot.id);

    const summary = (await http().get('/api/v1/dashboard/summary').set(ownerA()).expect(200)).body;
    const depotRow = summary.sites.find((s: { siteId: string }) => s.siteId === depot.id);
    expect(depotRow).toBeTruthy();
    expect(depotRow.activeJobs).toBe(2);
    expect(summary.unassignedActiveJobs).toBeGreaterThanOrEqual(1);
  });

  it('isolates sites between tenants and refuses a cross-tenant siteId', async () => {
    const secretSite = (
      await http().post('/api/v1/sites').set(ownerA()).send({ name: 'A Only Site' }).expect(201)
    ).body;

    // Tenant B cannot see tenant A's site.
    const bList = (await http().get('/api/v1/sites').set(ownerB()).expect(200)).body;
    expect(bList.map((s: { name: string }) => s.name)).not.toContain('A Only Site');

    // Tenant B cannot tag its own (otherwise-valid) job with tenant A's site id — validation is
    // RLS-scoped, so the ONLY reason for the 400 is the unknown site.
    const vb = await seedCustomerVehicle(ownerB);
    const rejected = await http()
      .post('/api/v1/work-items')
      .set(ownerB())
      .send({
        type: 'job',
        fields: { customerId: vb.customerId },
        subjectIds: [vb.vehicleId],
        siteId: secretSite.id,
      })
      .expect(400);
    expect(JSON.stringify(rejected.body)).toContain('Unknown site');

    // And a valid same-tenant job for B still works (proving the 400 above was the site, not the job).
    const ok = await createJob(ownerB, vb);
    expect(ok.id).toBeTruthy();
  });
});
