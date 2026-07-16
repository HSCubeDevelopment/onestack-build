// Card #21: assign staff, notes & photos on a job. Assignment is validated against tenant staff;
// notes keep author + time in order; photos round-trip through storage. Tenant-isolated. Supabase HTTP.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

// A 1x1 transparent PNG.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe.skipIf(!hasDb)('Work item detail — assign, notes, photos (card #21)', () => {
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
        .send({ displayName: 'D Cust', phone: '0400222333' })
    ).body.id;
    const vehicleId = (
      await http()
        .post(`/api/v1/contacts/${customerId}/vehicles`)
        .set(auth(t))
        .send({ rego: 'DET1', make: 'Ford', model: 'Focus', year: 2019 })
    ).body.id;
    return (
      await http()
        .post('/api/v1/work-items')
        .set(auth(t))
        .send({ type: 'job', fields: { customerId }, subjectIds: [vehicleId] })
    ).body.id;
  };

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Detail A');
    b = await makeTenant(admin, 'Detail B');
    app = await createApp();
    await app.init();
    jobId = await makeJob(a);
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      for (const tbl of [
        'onestack_work_item_attachment',
        'onestack_work_item_note',
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

  it('assigns a staff member, then unassigns; rejects a non-staff user', async () => {
    // Shop A's own staff user (from the auth fixture) can be assigned.
    const assigned = (
      await http()
        .post(`/api/v1/work-items/${jobId}/assign`)
        .set(auth(a))
        .send({ assignees: [a.staffUserId] })
        .expect(201)
    ).body;
    expect(assigned.assignees).toEqual([a.staffUserId]);

    // A user who is not a member of shop A cannot be assigned.
    await http()
      .post(`/api/v1/work-items/${jobId}/assign`)
      .set(auth(a))
      .send({ assignees: [b.staffUserId] })
      .expect(400);

    // Clearing the assignee is allowed.
    const cleared = (
      await http()
        .post(`/api/v1/work-items/${jobId}/assign`)
        .set(auth(a))
        .send({ assignees: [] })
        .expect(201)
    ).body;
    expect(cleared.assignees).toEqual([]);
  });

  it('adds notes with author + time, newest-first', async () => {
    await http()
      .post(`/api/v1/work-items/${jobId}/notes`)
      .set(auth(a))
      .send({ body: 'Dropped off, keys in lockbox' })
      .expect(201);
    await http()
      .post(`/api/v1/work-items/${jobId}/notes`)
      .set(auth(a))
      .send({ body: 'Started strip-down' })
      .expect(201);

    const notes = (await http().get(`/api/v1/work-items/${jobId}/notes`).set(auth(a)).expect(200))
      .body;
    expect(notes).toHaveLength(2);
    expect(notes[0].body).toBe('Started strip-down'); // newest first
    expect(notes[0].authorUserId).toBe(a.staffUserId);
    expect(notes[0].createdAt).toBeTruthy();

    // Empty note rejected.
    await http()
      .post(`/api/v1/work-items/${jobId}/notes`)
      .set(auth(a))
      .send({ body: '   ' })
      .expect(400);
  });

  it('uploads a photo, lists it, fetches the bytes, then deletes it; rejects a non-image', async () => {
    const created = (
      await http()
        .post(`/api/v1/work-items/${jobId}/attachments`)
        .set(auth(a))
        .send({
          fileName: 'damage.png',
          contentType: 'image/png',
          dataBase64: PNG_BASE64,
          caption: 'Front bumper',
        })
        .expect(201)
    ).body;
    expect(created.sizeBytes).toBeGreaterThan(0);
    expect(created.caption).toBe('Front bumper');

    const list = (
      await http().get(`/api/v1/work-items/${jobId}/attachments`).set(auth(a)).expect(200)
    ).body;
    expect(list).toHaveLength(1);

    // Fetch the raw bytes back.
    const content = await http()
      .get(`/api/v1/work-items/${jobId}/attachments/${created.id}/content`)
      .set(auth(a))
      .expect(200);
    expect(content.headers['content-type']).toContain('image/png');
    expect(content.body.length).toBe(created.sizeBytes);

    // Non-image type rejected.
    await http()
      .post(`/api/v1/work-items/${jobId}/attachments`)
      .set(auth(a))
      .send({ fileName: 'x.exe', contentType: 'application/octet-stream', dataBase64: PNG_BASE64 })
      .expect(400);

    // Delete it.
    await http()
      .delete(`/api/v1/work-items/${jobId}/attachments/${created.id}`)
      .set(auth(a))
      .expect(204);
    expect(
      (await http().get(`/api/v1/work-items/${jobId}/attachments`).set(auth(a)).expect(200)).body,
    ).toHaveLength(0);
  });

  it('accepts a large photo upload (base64 > 100kb — regression for the body-size limit)', async () => {
    // ~1.5 MB of base64 (a real camera photo) — would 413 under the default 100kb JSON limit.
    const bigBase64 = 'A'.repeat(1_500_000);
    const created = (
      await http()
        .post(`/api/v1/work-items/${jobId}/attachments`)
        .set(auth(a))
        .send({ fileName: 'big.jpg', contentType: 'image/jpeg', dataBase64: bigBase64 })
        .expect(201)
    ).body;
    expect(created.sizeBytes).toBeGreaterThan(1_000_000);
    await http()
      .delete(`/api/v1/work-items/${jobId}/attachments/${created.id}`)
      .set(auth(a))
      .expect(204);
  });

  it("is tenant-isolated: shop B cannot read shop A's notes, photos, or assign to its job", async () => {
    await http()
      .post(`/api/v1/work-items/${jobId}/notes`)
      .set(auth(a))
      .send({ body: 'Private note' })
      .expect(201);

    // B sees the job as not-found for every detail route.
    await http().get(`/api/v1/work-items/${jobId}/notes`).set(auth(b)).expect(404);
    await http().get(`/api/v1/work-items/${jobId}/attachments`).set(auth(b)).expect(404);
    await http()
      .post(`/api/v1/work-items/${jobId}/assign`)
      .set(auth(b))
      .send({ assignees: [] })
      .expect(404);
  });
});
