// Phase 3 — Segmentation & tagging. Define tags, assign them to contacts, read a tag's contacts (the
// segment). Generic CRM. Tenant-isolated: one shop can never see or touch another's tags or assignments.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Segmentation & tagging (Phase 3)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let tagId: string;
  let c1: string;
  let c2: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  const makeContact = async (t: TestTenant, name: string): Promise<string> =>
    (
      await http()
        .post('/api/v1/contacts')
        .set(auth(t))
        .send({ displayName: name, phone: '0400000000' })
        .expect(201)
    ).body.id;

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Tag A');
    b = await makeTenant(admin, 'Tag B');
    app = await createApp();
    await app.init();
    c1 = await makeContact(a, 'Jane Fleet');
    c2 = await makeContact(a, 'Tom Retail');
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      for (const tbl of ['onestack_contact_tag', 'onestack_tag', 'onestack_contact']) {
        await admin.$executeRawUnsafe(`DELETE FROM "${tbl}" WHERE "tenantId" = $1::uuid`, t);
      }
    }
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  it('creates a tag; rejects a duplicate name', async () => {
    const tag = (
      await http()
        .post('/api/v1/tags')
        .set(auth(a))
        .send({ name: 'Fleet', color: 'blue' })
        .expect(201)
    ).body;
    tagId = tag.id;
    expect(tag.name).toBe('Fleet');
    expect(tag.contactCount).toBe(0);

    // Case-insensitive duplicate rejected.
    await http().post('/api/v1/tags').set(auth(a)).send({ name: 'fleet' }).expect(409);
    // Empty rejected.
    await http().post('/api/v1/tags').set(auth(a)).send({ name: '  ' }).expect(400);
  });

  it('assigns the tag to contacts (idempotent) and reports segment size', async () => {
    await http().post(`/api/v1/contacts/${c1}/tags`).set(auth(a)).send({ tagId }).expect(204);
    await http().post(`/api/v1/contacts/${c2}/tags`).set(auth(a)).send({ tagId }).expect(204);
    // Re-assigning is a no-op, not an error.
    await http().post(`/api/v1/contacts/${c1}/tags`).set(auth(a)).send({ tagId }).expect(204);

    const tags = (await http().get('/api/v1/tags').set(auth(a)).expect(200)).body;
    const fleet = tags.find((t: { id: string }) => t.id === tagId);
    expect(fleet.contactCount).toBe(2);

    // The segment: contacts with the tag.
    const seg = (await http().get(`/api/v1/tags/${tagId}/contacts`).set(auth(a)).expect(200)).body;
    expect(seg.map((c: { id: string }) => c.id).sort()).toEqual([c1, c2].sort());

    // A contact's tags.
    const c1tags = (await http().get(`/api/v1/contacts/${c1}/tags`).set(auth(a)).expect(200)).body;
    expect(c1tags).toHaveLength(1);
    expect(c1tags[0].name).toBe('Fleet');
  });

  it('unassigns a tag and the segment shrinks', async () => {
    await http().delete(`/api/v1/contacts/${c2}/tags/${tagId}`).set(auth(a)).expect(204);
    const seg = (await http().get(`/api/v1/tags/${tagId}/contacts`).set(auth(a)).expect(200)).body;
    expect(seg.map((c: { id: string }) => c.id)).toEqual([c1]);
  });

  it('renames a tag; deleting it removes its assignments', async () => {
    const renamed = (
      await http()
        .patch(`/api/v1/tags/${tagId}`)
        .set(auth(a))
        .send({ name: 'Fleet accounts' })
        .expect(200)
    ).body;
    expect(renamed.name).toBe('Fleet accounts');
    expect(renamed.contactCount).toBe(1);

    await http().delete(`/api/v1/tags/${tagId}`).set(auth(a)).expect(204);
    // Gone from the catalogue, and the contact no longer has it.
    expect((await http().get('/api/v1/tags').set(auth(a)).expect(200)).body).toHaveLength(0);
    expect(
      (await http().get(`/api/v1/contacts/${c1}/tags`).set(auth(a)).expect(200)).body,
    ).toHaveLength(0);
  });

  it("is tenant-isolated: shop B cannot see or touch shop A's tags or tag A's contacts", async () => {
    const tag = (await http().post('/api/v1/tags').set(auth(a)).send({ name: 'VIP' }).expect(201))
      .body;
    await http()
      .post(`/api/v1/contacts/${c1}/tags`)
      .set(auth(a))
      .send({ tagId: tag.id })
      .expect(204);

    // B's catalogue is empty (A's tag is invisible).
    expect((await http().get('/api/v1/tags').set(auth(b)).expect(200)).body).toHaveLength(0);
    // B can't read A's tag's segment, nor A's contact's tags, nor assign A's contact.
    await http().get(`/api/v1/tags/${tag.id}/contacts`).set(auth(b)).expect(404);
    await http().get(`/api/v1/contacts/${c1}/tags`).set(auth(b)).expect(404);
    await http()
      .post(`/api/v1/contacts/${c1}/tags`)
      .set(auth(b))
      .send({ tagId: tag.id })
      .expect(404);
  });
});
