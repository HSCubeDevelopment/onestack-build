// Phase 3 — Onboarding & data migration (card #152). Import existing customers from CSV (preview then
// confirm, de-duplicated) and a setup checklist guiding the shop to first value. Owns no tables. Tenant-
// isolated (via the underlying services).
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Onboarding & data migration (Phase 3)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Onboard A');
    b = await makeTenant(admin, 'Onboard B');
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      await admin.$executeRawUnsafe(
        `DELETE FROM "onestack_contact" WHERE "tenantId" = $1::uuid`,
        t,
      );
    }
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  it('starts with an all-incomplete checklist', async () => {
    const list = (await http().get('/api/v1/onboarding/checklist').set(auth(a)).expect(200)).body;
    expect(list.total).toBe(5);
    expect(list.completed).toBe(0);
    expect(list.complete).toBe(false);
  });

  it('dry-run previews a CSV import without writing', async () => {
    const csv = 'displayName,phone,email\nJane,0400000000,jane@x.com\nBad,,\nJane2,0400000000,';
    const res = (
      await http()
        .post('/api/v1/onboarding/import/contacts')
        .set(auth(a))
        .send({ csv, dryRun: true })
        .expect(201)
    ).body;
    expect(res.dryRun).toBe(true);
    expect(res.summary).toMatchObject({ total: 3, ok: 1, error: 1, duplicate: 1 });
    expect(res.created).toBe(0);
    // Nothing written yet.
    const list = (await http().get('/api/v1/onboarding/checklist').set(auth(a)).expect(200)).body;
    expect(list.steps.find((s: { key: string }) => s.key === 'customers').done).toBe(false);
  });

  it('imports the valid rows for real and updates the checklist', async () => {
    const csv = 'displayName,phone\nJane,0400000000\nSam,0411111111';
    const res = (
      await http().post('/api/v1/onboarding/import/contacts').set(auth(a)).send({ csv }).expect(201)
    ).body;
    expect(res.created).toBe(2);

    // Re-importing the same file → both are duplicates now.
    const again = (
      await http().post('/api/v1/onboarding/import/contacts').set(auth(a)).send({ csv }).expect(201)
    ).body;
    expect(again.summary.duplicate).toBe(2);
    expect(again.created).toBe(0);

    const list = (await http().get('/api/v1/onboarding/checklist').set(auth(a)).expect(200)).body;
    expect(list.steps.find((s: { key: string }) => s.key === 'customers').done).toBe(true);
    expect(list.completed).toBe(1);
  });

  it('rejects an empty import', async () => {
    await http()
      .post('/api/v1/onboarding/import/contacts')
      .set(auth(a))
      .send({ rows: [] })
      .expect(400);
  });

  it("is tenant-isolated: shop B's import didn't leak; its checklist is empty", async () => {
    const list = (await http().get('/api/v1/onboarding/checklist').set(auth(b)).expect(200)).body;
    expect(list.completed).toBe(0);
    // B importing a phone that A already has is NOT a duplicate for B (separate tenant).
    const res = (
      await http()
        .post('/api/v1/onboarding/import/contacts')
        .set(auth(b))
        .send({ rows: [{ displayName: 'Jane', phone: '0400000000' }] })
        .expect(201)
    ).body;
    expect(res.created).toBe(1);
  });
});
