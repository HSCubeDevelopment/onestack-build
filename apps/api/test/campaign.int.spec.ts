// Phase 3 — Marketing campaigns. Create a segmented email/SMS campaign, preview the audience (segment
// contacts reachable on the channel), and "send" it through the no-op vendor boundary. Tenant-isolated.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Marketing campaigns (Phase 3)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let tagId: string;
  let campaignId: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  const makeContact = (t: TestTenant, name: string, email?: string) =>
    http()
      .post('/api/v1/contacts')
      .set(auth(t))
      .send({ displayName: name, phone: '0400000000', ...(email ? { email } : {}) })
      .expect(201);

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Camp A');
    b = await makeTenant(admin, 'Camp B');
    app = await createApp();
    await app.init();

    tagId = (
      await http().post('/api/v1/tags').set(auth(a)).send({ name: 'Newsletter' }).expect(201)
    ).body.id;
    const withEmail = (await makeContact(a, 'Emailer', 'e@x.com')).body.id;
    const noEmail = (await makeContact(a, 'No Email')).body.id;
    for (const c of [withEmail, noEmail]) {
      await http().post(`/api/v1/contacts/${c}/tags`).set(auth(a)).send({ tagId }).expect(204);
    }
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      for (const tbl of [
        'onestack_campaign',
        'onestack_contact_tag',
        'onestack_tag',
        'onestack_contact',
      ]) {
        await admin.$executeRawUnsafe(`DELETE FROM "${tbl}" WHERE "tenantId" = $1::uuid`, t);
      }
    }
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  it('creates a campaign targeting a segment; rejects a bad channel', async () => {
    const c = (
      await http()
        .post('/api/v1/campaigns')
        .set(auth(a))
        .send({
          name: 'July promo',
          channel: 'email',
          subject: 'Winter service',
          body: 'Book now',
          tagId,
        })
        .expect(201)
    ).body;
    campaignId = c.id;
    expect(c.status).toBe('draft');
    expect(c.channel).toBe('email');

    await http()
      .post('/api/v1/campaigns')
      .set(auth(a))
      .send({ name: 'Bad', channel: 'fax', tagId })
      .expect(400);
  });

  it('previews the audience (only segment contacts reachable on the channel)', async () => {
    const aud = (
      await http().get(`/api/v1/campaigns/${campaignId}/audience`).set(auth(a)).expect(200)
    ).body;
    // Only the contact with an email counts for an email campaign.
    expect(aud.channel).toBe('email');
    expect(aud.recipientCount).toBe(1);
    expect(aud.recipients[0].address).toBe('e@x.com');
  });

  it('sending reports the no-op vendor boundary; the campaign stays draft', async () => {
    const res = (await http().post(`/api/v1/campaigns/${campaignId}/send`).set(auth(a)).expect(201))
      .body;
    expect(res.result.delivered).toBe(false);
    expect(res.result.reason).toMatch(/no email\/sms provider/i);
    expect(res.campaign.status).toBe('draft'); // NOT 'sent' until a real delivery succeeds
  });

  it("is tenant-isolated: shop B cannot see, target, or send shop A's campaign", async () => {
    expect((await http().get('/api/v1/campaigns').set(auth(b)).expect(200)).body).toHaveLength(0);
    await http().get(`/api/v1/campaigns/${campaignId}`).set(auth(b)).expect(404);
    await http().post(`/api/v1/campaigns/${campaignId}/send`).set(auth(b)).expect(404);
    // B can't target A's tag either.
    await http()
      .post('/api/v1/campaigns')
      .set(auth(b))
      .send({ name: 'X', channel: 'email', tagId })
      .expect(404);
  });
});
