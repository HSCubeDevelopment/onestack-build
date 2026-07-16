// Phase 3 — Customer / client portal (card #150). A passwordless per-customer page: their jobs, documents,
// quotes (approve/decline) and invoices (read-only — payments deferred), plus a booking link. The token is
// the credential (no hand-rolled auth). Everything is filtered to the one customer. Tenant-isolated.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Customer portal (Phase 3)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let contactId: string;
  let jobId: string;
  let quoteId: string;
  let token: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Portal A');
    b = await makeTenant(admin, 'Portal B');
    app = await createApp();
    await app.init();

    contactId = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(a))
        .send({ displayName: 'Jane Customer', phone: '0400000000' })
        .expect(201)
    ).body.id;
    const vehicleId = (
      await http()
        .post(`/api/v1/contacts/${contactId}/vehicles`)
        .set(auth(a))
        .send({ rego: 'PORT150', make: 'Kia', model: 'Cerato', year: 2020 })
        .expect(201)
    ).body.id;
    jobId = (
      await http()
        .post('/api/v1/work-items')
        .set(auth(a))
        .send({ type: 'job', fields: { customerId: contactId }, subjectIds: [vehicleId] })
        .expect(201)
    ).body.id;
    // A Sent quote to approve from the portal.
    quoteId = (await http().post(`/api/v1/work-items/${jobId}/quotes`).set(auth(a)).expect(201))
      .body.id;
    await http()
      .post(`/api/v1/quotes/${quoteId}/lines`)
      .set(auth(a))
      .send({ description: 'Repair', type: 'labour', quantity: 1, unitPriceCents: 50000 })
      .expect(201);
    await http()
      .post(`/api/v1/quotes/${quoteId}/status`)
      .set(auth(a))
      .send({ status: 'Sent' })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      for (const tbl of [
        'onestack_portal_access',
        'onestack_line_item',
        'onestack_quote',
        'onestack_reference_counter',
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

  it('owner issues a passwordless portal link (reused on a second call)', async () => {
    const first = (
      await http().post(`/api/v1/contacts/${contactId}/portal-link`).set(auth(a)).expect(201)
    ).body;
    expect(first.portalUrl).toMatch(/^\/public\/portal\/[a-f0-9]+$/);
    token = first.portalUrl.split('/').pop();
    const second = (
      await http().post(`/api/v1/contacts/${contactId}/portal-link`).set(auth(a)).expect(201)
    ).body;
    expect(second.portalUrl).toBe(first.portalUrl);
  });

  it('opens the public portal (no auth): the customer sees their job and Sent quote', async () => {
    const home = (await http().get(`/api/v1/public/portal/${token}`).expect(200)).body;
    expect(home.customer.name).toBe('Jane Customer');
    expect(home.jobs).toHaveLength(1);
    expect(home.quotes.some((q: { id: string }) => q.id === quoteId)).toBe(true);
    expect(home.payments.online).toBe(false); // payments deferred
  });

  it('customer approves the quote from the portal', async () => {
    const res = (
      await http()
        .post(`/api/v1/public/portal/${token}/quotes/${quoteId}/decision`)
        .send({ decision: 'accept' })
        .expect(201)
    ).body;
    expect(res.status).toBe('Accepted');
    // Reflected back in the owner's quote.
    const q = (await http().get(`/api/v1/quotes/${quoteId}`).set(auth(a)).expect(200)).body;
    expect(q.status).toBe('Accepted');
  });

  it("is tenant-isolated: shop B can't issue a link for shop A's customer", async () => {
    await http().post(`/api/v1/contacts/${contactId}/portal-link`).set(auth(b)).expect(404);
  });

  it('revoked token stops working', async () => {
    await http().delete(`/api/v1/contacts/${contactId}/portal-link`).set(auth(a)).expect(200);
    await http().get(`/api/v1/public/portal/${token}`).expect(404);
  });
});
