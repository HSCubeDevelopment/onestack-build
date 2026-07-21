// Card #20: Job card = a Work Item of the automotive pack's "job" type. HTTP against Supabase.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Job card (card #20)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let customerId: string;
  let vehicleId: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Shop A');
    b = await makeTenant(admin, 'Shop B');
    app = await createApp();
    await app.init();
    // A customer + their vehicle (via #10 API) to attach jobs to.
    customerId = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(a))
        .send({ displayName: 'Dana', phone: '0400555666' })
    ).body.id;
    vehicleId = (
      await http()
        .post(`/api/v1/contacts/${customerId}/vehicles`)
        .set(auth(a))
        .send({ rego: 'JOB001', make: 'Mazda', model: '3', year: 2019 })
    ).body.id;
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      await admin.$executeRawUnsafe(
        `DELETE FROM "onestack_work_item_subject" WHERE "tenantId" = $1::uuid`,
        t,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM "onestack_work_item" WHERE "tenantId" = $1::uuid`,
        t,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM "onestack_work_item_counter" WHERE "tenantId" = $1::uuid`,
        t,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM "onestack_subject" WHERE "tenantId" = $1::uuid`,
        t,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM "onestack_contact" WHERE "tenantId" = $1::uuid`,
        t,
      );
    }
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  const newJob = () =>
    http()
      .post('/api/v1/work-items')
      .set(auth(a))
      .send({
        type: 'job',
        fields: { customerId, description: 'Front bumper' },
        subjectIds: [vehicleId],
      });

  it('creates a job with a J- number and Booked status; blocks a job with no vehicle', async () => {
    const job = (await newJob().expect(201)).body;
    expect(job.reference).toMatch(/^J-\d{6}$/);
    expect(job.stateName).toBe('Booked');

    // A repair needs a car → no subject → 400.
    await http()
      .post('/api/v1/work-items')
      .set(auth(a))
      .send({ type: 'job', fields: { customerId } })
      .expect(400);
  });

  it('moves through Booked → In progress → Ready → Collected; rejects illegal transitions', async () => {
    const job = (await newJob().expect(201)).body;
    await http()
      .post(`/api/v1/work-items/${job.id}/transition`)
      .set(auth(a))
      .send({ event: 'COLLECT' })
      .expect(400); // illegal from Booked
    expect(
      (
        await http()
          .post(`/api/v1/work-items/${job.id}/transition`)
          .set(auth(a))
          .send({ event: 'START' })
          .expect(201)
      ).body.stateName,
    ).toBe('InProgress');
    expect(
      (
        await http()
          .post(`/api/v1/work-items/${job.id}/transition`)
          .set(auth(a))
          .send({ event: 'READY' })
          .expect(201)
      ).body.stateName,
    ).toBe('Ready');
    expect(
      (
        await http()
          .post(`/api/v1/work-items/${job.id}/transition`)
          .set(auth(a))
          .send({ event: 'COLLECT' })
          .expect(201)
      ).body.stateName,
    ).toBe('Collected');
  });

  it('the job card pulls in the linked vehicle automatically; edits and soft-deletes', async () => {
    const job = (await newJob().expect(201)).body;
    const card = (await http().get(`/api/v1/work-items/${job.id}`).set(auth(a)).expect(200)).body;
    expect(card.subjects).toHaveLength(1);
    expect(card.subjects[0].fields).toMatchObject({ rego: 'JOB001' });

    await http()
      .patch(`/api/v1/work-items/${job.id}`)
      .set(auth(a))
      .send({ fields: { customerId, description: 'Rear door' }, expectedVersion: job.version })
      .expect(200);

    await http().delete(`/api/v1/work-items/${job.id}`).set(auth(a)).expect(204);
    await http().get(`/api/v1/work-items/${job.id}`).set(auth(a)).expect(404);
  });

  it('is tenant-isolated: Shop B sees no Shop A jobs', async () => {
    const job = (await newJob().expect(201)).body;
    await http().get(`/api/v1/work-items/${job.id}`).set(auth(b)).expect(404);
    const listB = (await http().get('/api/v1/work-items?type=job').set(auth(b)).expect(200)).body;
    expect(listB.find((j: { id: string }) => j.id === job.id)).toBeUndefined();
  });

  // The jobs list (card 302) needs a rego per row without an N+1 of per-job lookups.
  it('withSubjects=1 enriches each list row with its vehicle label; the plain list does not', async () => {
    const job = (await newJob().expect(201)).body;

    const plain = (await http().get('/api/v1/work-items?type=job').set(auth(a)).expect(200))
      .body as { id: string; subjectLabel?: string }[];
    expect(plain.find((j) => j.id === job.id)?.subjectLabel).toBeUndefined();

    const enriched = (
      await http().get('/api/v1/work-items?type=job&withSubjects=1').set(auth(a)).expect(200)
    ).body as { id: string; subjectLabel?: string | null }[];
    // The label is the vehicle we attached — "Mazda 3 (JOB001)" — so a plate can be parsed from it.
    expect(enriched.find((j) => j.id === job.id)?.subjectLabel).toBe('Mazda 3 (JOB001)');

    // Enrichment can't widen scope: Shop B's enriched list still contains none of Shop A's jobs.
    const enrichedB = (
      await http().get('/api/v1/work-items?type=job&withSubjects=1').set(auth(b)).expect(200)
    ).body as { id: string }[];
    expect(enrichedB.find((j) => j.id === job.id)).toBeUndefined();
  });
});
