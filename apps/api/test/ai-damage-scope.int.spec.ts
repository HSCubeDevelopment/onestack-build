// Phase 2 flagship, slice A — AI photo-to-quote damage scope. Generate a draft scope from a job's
// photos (using the deterministic stub analyzer — no external API), read it, edit it, and prove one
// shop can never touch another's scope. Nothing here sends or orders anything: the scope is a draft.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

// A 1x1 transparent PNG.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe.skipIf(!hasDb)('AI damage scope — photo-to-quote slice A (Phase 2)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let jobWithPhoto: string;
  let jobNoPhoto: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  const makeJob = async (t: TestTenant): Promise<string> => {
    const customerId = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(t))
        .send({ displayName: 'Scope Cust', phone: '0400555777' })
    ).body.id;
    const vehicleId = (
      await http()
        .post(`/api/v1/contacts/${customerId}/vehicles`)
        .set(auth(t))
        .send({ rego: 'SCOPE1', make: 'Mazda', model: '3', year: 2020 })
    ).body.id;
    return (
      await http()
        .post('/api/v1/work-items')
        .set(auth(t))
        .send({ type: 'job', fields: { customerId }, subjectIds: [vehicleId] })
    ).body.id;
  };

  const addPhoto = async (t: TestTenant, jobId: string): Promise<void> => {
    await http()
      .post(`/api/v1/work-items/${jobId}/attachments`)
      .set(auth(t))
      .send({ fileName: 'damage.png', contentType: 'image/png', dataBase64: PNG_BASE64 })
      .expect(201);
  };

  beforeAll(async () => {
    // Force the deterministic stub analyzer regardless of local env — the flow needs no external API.
    delete process.env.ANTHROPIC_API_KEY;
    admin = adminPrisma();
    a = await makeTenant(admin, 'Scope A');
    b = await makeTenant(admin, 'Scope B');
    app = await createApp();
    await app.init();
    jobWithPhoto = await makeJob(a);
    jobNoPhoto = await makeJob(a);
    await addPhoto(a, jobWithPhoto);
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      for (const tbl of [
        'onestack_damage_scope',
        'onestack_work_item_attachment',
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
  }, 120_000); // generous: cleanup spans many tables and the pooler can be slow under load

  it('requires at least one photo before generating a scope', async () => {
    await http().post(`/api/v1/work-items/${jobNoPhoto}/ai-scope`).set(auth(a)).expect(400);
  });

  it('generates an editable draft scope from the job photos', async () => {
    const scope = (
      await http().post(`/api/v1/work-items/${jobWithPhoto}/ai-scope`).set(auth(a)).expect(201)
    ).body;

    expect(scope.status).toBe('draft');
    expect(scope.source).toBe('ai');
    expect(scope.model).toBe('stub'); // no key → deterministic stub
    expect(scope.photoCount).toBe(1);
    expect(scope.items.length).toBeGreaterThan(0);
    for (const item of scope.items) {
      expect(item.id).toBeTruthy();
      expect(item.panel).toBeTruthy();
      expect(['replace', 'repair', 'paint']).toContain(item.operation);
    }
    // At least one "replace" — that's what becomes a part line in slice B.
    expect(scope.items.some((i: { operation: string }) => i.operation === 'replace')).toBe(true);
  });

  it('reads back the current draft for the job', async () => {
    const scope = (
      await http().get(`/api/v1/work-items/${jobWithPhoto}/ai-scope`).set(auth(a)).expect(200)
    ).body;
    expect(scope.workItemId).toBe(jobWithPhoto);
    expect(scope.items.length).toBeGreaterThan(0);
  });

  it('re-generating replaces the draft (a job keeps one current scope)', async () => {
    const first = (
      await http().post(`/api/v1/work-items/${jobWithPhoto}/ai-scope`).set(auth(a)).expect(201)
    ).body;
    const second = (
      await http().post(`/api/v1/work-items/${jobWithPhoto}/ai-scope`).set(auth(a)).expect(201)
    ).body;
    expect(second.id).not.toBe(first.id);

    // Exactly one draft row remains for the job.
    const count = await admin.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::int AS n FROM "onestack_damage_scope" WHERE "workItemId" = $1::uuid`,
      jobWithPhoto,
    );
    expect(Number(count[0]?.n ?? 0)).toBe(1);
  });

  it('lets the estimator edit the draft (summary + items), flipping source to manual', async () => {
    const scope = (
      await http().get(`/api/v1/work-items/${jobWithPhoto}/ai-scope`).set(auth(a)).expect(200)
    ).body;

    const edited = (
      await http()
        .patch(`/api/v1/ai-scope/${scope.id}`)
        .set(auth(a))
        .send({
          summary: 'Estimator-confirmed scope',
          items: [
            { panel: 'Rear bumper', operation: 'replace', note: 'Confirmed by estimator' },
            { panel: 'Boot lid', operation: 'paint' },
          ],
        })
        .expect(200)
    ).body;

    expect(edited.summary).toBe('Estimator-confirmed scope');
    expect(edited.source).toBe('manual');
    expect(edited.items).toHaveLength(2);
    expect(edited.items[0].panel).toBe('Rear bumper');

    // A bad operation is rejected.
    await http()
      .patch(`/api/v1/ai-scope/${scope.id}`)
      .set(auth(a))
      .send({ items: [{ panel: 'Roof', operation: 'weld' }] })
      .expect(400);
  });

  it("is tenant-isolated: shop B cannot generate, read, or edit shop A's scope", async () => {
    const scope = (
      await http().get(`/api/v1/work-items/${jobWithPhoto}/ai-scope`).set(auth(a)).expect(200)
    ).body;

    // B sees A's job as not-found for generate + read.
    await http().post(`/api/v1/work-items/${jobWithPhoto}/ai-scope`).set(auth(b)).expect(404);
    await http().get(`/api/v1/work-items/${jobWithPhoto}/ai-scope`).set(auth(b)).expect(404);

    // B cannot edit or delete A's scope by id.
    await http()
      .patch(`/api/v1/ai-scope/${scope.id}`)
      .set(auth(b))
      .send({ summary: 'hijack' })
      .expect(404);
    await http().delete(`/api/v1/ai-scope/${scope.id}`).set(auth(b)).expect(404);

    // A's scope is untouched.
    const after = (
      await http().get(`/api/v1/work-items/${jobWithPhoto}/ai-scope`).set(auth(a)).expect(200)
    ).body;
    expect(after.summary).toBe('Estimator-confirmed scope');
  });
});
