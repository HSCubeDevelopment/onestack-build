// Phase 4 — Duplicate detection & merge (card #200). Detect duplicate customers, then merge one into
// another: the duplicate's records (vehicle, job) repoint onto the primary and the duplicate is
// soft-deleted (reversible). DESTRUCTIVE + PII, so OWNER-only and tenant-isolated.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Duplicate detection & merge (Phase 4)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let primaryId: string;
  let dupId: string;
  let dupJobId: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Merge A');
    b = await makeTenant(admin, 'Merge B');
    app = await createApp();
    await app.init();

    // Two contacts that are the same person (shared phone) — one is the duplicate.
    primaryId = (
      await http().post('/api/v1/contacts').set(auth(a)).send({ displayName: 'Jane Smith', phone: '0400000000', email: 'jane@x.com' }).expect(201)
    ).body.id;
    dupId = (
      await http().post('/api/v1/contacts').set(auth(a)).send({ displayName: 'J Smith', phone: '+61 400 000 000' }).expect(201)
    ).body.id;

    // Give the DUPLICATE a vehicle + a job, so the merge has references to repoint.
    const vehicleId = (
      await http().post(`/api/v1/contacts/${dupId}/vehicles`).set(auth(a)).send({ rego: 'DUP001', make: 'Kia', model: 'Cerato', year: 2020 }).expect(201)
    ).body.id;
    dupJobId = (
      await http().post('/api/v1/work-items').set(auth(a)).send({ type: 'job', fields: { customerId: dupId }, subjectIds: [vehicleId] }).expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      for (const tbl of [
        'onestack_work_item_subject',
        'onestack_work_item',
        'onestack_work_item_counter',
        'onestack_subject',
        'onestack_contact',
      ]) {
        await admin.$executeRawUnsafe(`DELETE FROM "${tbl}" WHERE "tenantId" = $1::uuid`, t);
      }
    }
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  it('detects the duplicate pair (shared phone)', async () => {
    const groups = (await http().get('/api/v1/contacts/duplicates').set(auth(a)).expect(200)).body;
    expect(groups).toHaveLength(1);
    expect(groups[0].reasons).toContain('phone');
    expect(groups[0].contacts.map((c: { id: string }) => c.id).sort()).toEqual([primaryId, dupId].sort());
  });

  it('rejects merging a contact into itself', async () => {
    await http().post(`/api/v1/contacts/${primaryId}/merge/${primaryId}`).set(auth(a)).expect(400);
  });

  it('merges the duplicate into the primary and repoints its records', async () => {
    const res = (await http().post(`/api/v1/contacts/${primaryId}/merge/${dupId}`).set(auth(a)).expect(201)).body;
    expect(res.reassigned.vehicles).toBe(1);
    expect(res.reassigned.workItems).toBe(1);
    expect(res.primary.id).toBe(primaryId);

    // The duplicate is gone (soft-deleted); the primary remains.
    await http().get(`/api/v1/contacts/${dupId}`).set(auth(a)).expect(404);
    await http().get(`/api/v1/contacts/${primaryId}`).set(auth(a)).expect(200);

    // The vehicle now sits under the primary, and the job references the primary.
    const vehicles = (await http().get(`/api/v1/contacts/${primaryId}/vehicles`).set(auth(a)).expect(200)).body;
    expect(vehicles.some((v: { fields: { rego: string } }) => v.fields.rego === 'DUP001')).toBe(true);
    const job = (await http().get(`/api/v1/work-items/${dupJobId}`).set(auth(a)).expect(200)).body;
    expect(job.fields.customerId).toBe(primaryId);

    // The duplicate no longer shows up as a duplicate.
    expect((await http().get('/api/v1/contacts/duplicates').set(auth(a)).expect(200)).body).toHaveLength(0);
  });

  it("is tenant-isolated: shop B can't see or merge shop A's contacts", async () => {
    expect((await http().get('/api/v1/contacts/duplicates').set(auth(b)).expect(200)).body).toHaveLength(0);
    // Both ids are shop A's — to shop B they don't exist.
    await http().post(`/api/v1/contacts/${primaryId}/merge/${dupId}`).set(auth(b)).expect(404);
  });
});
