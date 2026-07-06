// Card #12: public web-form lead capture. Untrusted input → honeypot + validation; submit creates a
// tenant-scoped lead + notifies the shop; New→Contacted→Converted; convert makes a Customer. Supabase.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Lead capture & web forms (card #12)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let tokenA: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.staffToken}` });

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Lead A');
    b = await makeTenant(admin, 'Lead B');
    app = await createApp();
    await app.init();
    tokenA = (
      await http()
        .post('/api/v1/lead-forms')
        .set(auth(a))
        .send({ name: 'Website enquiry' })
        .expect(201)
    ).body.publicToken;
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      for (const tbl of [
        'onestack_lead',
        'onestack_lead_form',
        'onestack_notification',
        'onestack_contact',
      ]) {
        await admin.$executeRawUnsafe(`DELETE FROM "${tbl}" WHERE "tenantId" = $1::uuid`, t);
      }
    }
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  it('public submit creates a New lead the shop can see', async () => {
    await http()
      .post(`/api/v1/public/lead-forms/${tokenA}/submit`)
      .send({ name: 'Jane Public', phone: '0400123123', message: 'Scratched my door' })
      .expect(201)
      .expect((r) => expect(r.body).toEqual({ received: true }));

    const leads = (await http().get('/api/v1/leads').set(auth(a)).expect(200)).body;
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ name: 'Jane Public', status: 'New', source: 'web_form' });
  });

  it('drops honeypot (bot) submissions silently — no lead created', async () => {
    const before = (await http().get('/api/v1/leads').set(auth(a))).body.length;
    await http()
      .post(`/api/v1/public/lead-forms/${tokenA}/submit`)
      .send({ name: 'Bot', phone: '000', website: 'http://spam.example' })
      .expect(201)
      .expect((r) => expect(r.body).toEqual({ received: true }));
    const after = (await http().get('/api/v1/leads').set(auth(a))).body.length;
    expect(after).toBe(before); // honeypot hit did not create a lead
  });

  it('rejects missing required fields and an unknown form token', async () => {
    await http()
      .post(`/api/v1/public/lead-forms/${tokenA}/submit`)
      .send({ name: 'No Phone' })
      .expect(400);
    await http()
      .post('/api/v1/public/lead-forms/deadbeefdeadbeef/submit')
      .send({ name: 'X', phone: '0400000000' })
      .expect(404);
  });

  it('moves a lead New → Contacted, then converts it into a Customer', async () => {
    const lead = (await http().get('/api/v1/leads').set(auth(a))).body[0];
    const contacted = (
      await http()
        .patch(`/api/v1/leads/${lead.id}/status`)
        .set(auth(a))
        .send({ status: 'Contacted' })
        .expect(200)
    ).body;
    expect(contacted.status).toBe('Contacted');

    const result = (await http().post(`/api/v1/leads/${lead.id}/convert`).set(auth(a)).expect(201))
      .body;
    expect(result.contactId).toBeTruthy();
    expect(result.lead.status).toBe('Converted');

    // The new Customer exists and matches the lead.
    const contact = (
      await http().get(`/api/v1/contacts/${result.contactId}`).set(auth(a)).expect(200)
    ).body;
    expect(contact.displayName).toBe('Jane Public');

    // Converting again is refused.
    await http().post(`/api/v1/leads/${lead.id}/convert`).set(auth(a)).expect(409);
  });

  it("is tenant-isolated: shop B sees none of shop A's leads, and A's token writes only to A", async () => {
    // B's leads list is empty even though A has leads.
    expect((await http().get('/api/v1/leads').set(auth(b)).expect(200)).body).toHaveLength(0);
    // A submission via A's token lands in A, never B.
    await http()
      .post(`/api/v1/public/lead-forms/${tokenA}/submit`)
      .send({ name: 'Second A lead', phone: '0400999999' })
      .expect(201);
    expect((await http().get('/api/v1/leads').set(auth(b)).expect(200)).body).toHaveLength(0);
    expect(
      (await http().get('/api/v1/leads').set(auth(a)).expect(200)).body.length,
    ).toBeGreaterThanOrEqual(2);
  });
});
