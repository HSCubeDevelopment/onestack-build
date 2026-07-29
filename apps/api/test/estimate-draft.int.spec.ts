// Editable saved estimate + employee job detail. An estimate saved against a car can be REOPENED and
// edited in place (one draft per job — re-saving updates it), and a job's full detail is readable by
// staff. Both are tenant-isolated. (Requires the 0053 estimate-draft table, which saveEstimate now writes.)
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Editable estimate + job detail', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let vehicleId: string;
  let jobId: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Est A');
    b = await makeTenant(admin, 'Est B');
    app = await createApp();
    await app.init();
    // A draft car (creates the vehicle + an open job to hang the estimate on).
    const car = (
      await http().post('/api/v1/vehicle-profile/draft').set(auth(a)).send({ rego: 'EST123' })
    ).body;
    vehicleId = car.vehicleId;
    jobId = car.jobId;
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      await admin.$executeRawUnsafe(
        `DELETE FROM "onestack_estimate_draft" WHERE "tenantId" = $1::uuid`,
        t,
      );
    }
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  it('saves a structured estimate and reopens it', async () => {
    await http()
      .post(`/api/v1/vehicle-profile/${vehicleId}/estimate`)
      .set(auth(a))
      .send({ summary: 'Front bar scuff', photos: [], data: { configured: true, totalAud: 1234 } })
      .expect(201);

    const draft = (
      await http().get(`/api/v1/vehicle-profile/${vehicleId}/estimate`).set(auth(a)).expect(200)
    ).body;
    expect(draft).not.toBeNull();
    expect(draft.data.totalAud).toBe(1234);
    expect(draft.workItemId).toBe(jobId);
  });

  it('edits the estimate IN PLACE (same draft, updated value — not a duplicate)', async () => {
    const first = (
      await http().get(`/api/v1/vehicle-profile/${vehicleId}/estimate`).set(auth(a)).expect(200)
    ).body;

    await http()
      .post(`/api/v1/vehicle-profile/${vehicleId}/estimate`)
      .set(auth(a))
      .send({
        summary: 'Front bar scuff (revised)',
        photos: [],
        data: { configured: true, totalAud: 5678 },
        jobId,
      })
      .expect(201);

    const second = (
      await http().get(`/api/v1/vehicle-profile/${vehicleId}/estimate`).set(auth(a)).expect(200)
    ).body;
    expect(second.id).toBe(first.id); // same row — edited in place
    expect(second.data.totalAud).toBe(5678);

    // Exactly one draft persisted for the job.
    const count = await admin.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::int AS n FROM "onestack_estimate_draft" WHERE "workItemId" = $1::uuid`,
      jobId,
    );
    expect(Number(count[0]!.n)).toBe(1);
  });

  it('returns the job detail with car, estimate and money withheld', async () => {
    const detail = (
      await http().get(`/api/v1/vehicle-profile/jobs/${jobId}`).set(auth(a)).expect(200)
    ).body;
    expect(detail.job.id).toBe(jobId);
    expect(detail.vehicle.rego.toUpperCase()).toContain('EST123');
    expect(detail.estimate.data.totalAud).toBe(5678);
    expect(detail.moneyHidden).toBe(true);
  });

  it('is tenant-isolated: shop B cannot read the job detail or the estimate', async () => {
    await http().get(`/api/v1/vehicle-profile/jobs/${jobId}`).set(auth(b)).expect(404);
    // B doesn't own the vehicle, so its estimate lookup 404s (vehicle not found).
    await http().get(`/api/v1/vehicle-profile/${vehicleId}/estimate`).set(auth(b)).expect(404);
  });
});
