// Phase 3 — Dispatch & assignment. Route jobs to technicians (reusing work-item assignees), track each
// job's dispatch status + manual ETA, and view the dispatch board (jobs by technician). Tenant-isolated.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Dispatch & assignment (Phase 3)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let jobId: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  const makeJob = async (t: TestTenant): Promise<string> => {
    const customerId = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(t))
        .send({ displayName: 'Disp Cust', phone: '0400888999' })
        .expect(201)
    ).body.id;
    const vehicleId = (
      await http()
        .post(`/api/v1/contacts/${customerId}/vehicles`)
        .set(auth(t))
        .send({ rego: 'DSP1', make: 'Ford', model: 'Focus', year: 2020 })
        .expect(201)
    ).body.id;
    return (
      await http()
        .post('/api/v1/work-items')
        .set(auth(t))
        .send({ type: 'job', fields: { customerId }, subjectIds: [vehicleId] })
        .expect(201)
    ).body.id;
  };

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Disp A');
    b = await makeTenant(admin, 'Disp B');
    app = await createApp();
    await app.init();
    jobId = await makeJob(a);
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      for (const tbl of [
        'onestack_dispatch',
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

  it('defaults to pending, then sets a dispatch status + ETA', async () => {
    const before = (
      await http().get(`/api/v1/work-items/${jobId}/dispatch`).set(auth(a)).expect(200)
    ).body;
    expect(before.status).toBe('pending');

    const eta = new Date(Date.now() + 3600 * 1000).toISOString();
    const set = (
      await http()
        .post(`/api/v1/work-items/${jobId}/dispatch`)
        .set(auth(a))
        .send({ status: 'en_route', etaAt: eta, note: 'On the way' })
        .expect(201)
    ).body;
    expect(set.status).toBe('en_route');
    expect(set.etaAt).toBe(eta);
    expect(set.note).toBe('On the way');

    // Re-read persists.
    const after = (
      await http().get(`/api/v1/work-items/${jobId}/dispatch`).set(auth(a)).expect(200)
    ).body;
    expect(after.status).toBe('en_route');

    // A bad status is rejected.
    await http()
      .post(`/api/v1/work-items/${jobId}/dispatch`)
      .set(auth(a))
      .send({ status: 'teleporting' })
      .expect(400);
  });

  it('shows the dispatch board grouped by technician', async () => {
    // Assign the job to the owner (a technician), then it should appear in that lane.
    await http()
      .post(`/api/v1/work-items/${jobId}/assign`)
      .set(auth(a))
      .send({ assignees: [a.ownerUserId] })
      .expect(201);

    const board = (await http().get('/api/v1/dispatch/board').set(auth(a)).expect(200)).body;
    const lane = board.lanes.find(
      (l: { assigneeUserId: string | null }) => l.assigneeUserId === a.ownerUserId,
    );
    expect(lane).toBeTruthy();
    const job = lane.jobs.find((j: { id: string }) => j.id === jobId);
    expect(job.dispatchStatus).toBe('en_route');
    expect(job.customerName).toBe('Disp Cust');
  });

  it("is tenant-isolated: shop B cannot read or set dispatch on shop A's job, or see it on the board", async () => {
    await http().get(`/api/v1/work-items/${jobId}/dispatch`).set(auth(b)).expect(404);
    await http()
      .post(`/api/v1/work-items/${jobId}/dispatch`)
      .set(auth(b))
      .send({ status: 'on_site' })
      .expect(404);

    // B's dispatch board has no lanes (no jobs of its own).
    const board = (await http().get('/api/v1/dispatch/board').set(auth(b)).expect(200)).body;
    expect(board.lanes).toEqual([]);
  });
});
