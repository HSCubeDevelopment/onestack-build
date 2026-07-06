// Card #33: quote revisions / supplementary. An Accepted quote is revised (v2) after hidden damage is
// found; the original is retained untouched, the revision copies its lines, and totals recompute when the
// extra scope is added. Forward-only status. Tenant-isolated. Supabase HTTP.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Quote revision (card #33)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let jobId: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.staffToken}` });

  const addLine = (quoteId: string, desc: string, qty: number, cents: number) =>
    http()
      .post(`/api/v1/quotes/${quoteId}/lines`)
      .set(auth(a))
      .send({ description: desc, type: 'labour', quantity: qty, unitPriceCents: cents });

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'QR A');
    b = await makeTenant(admin, 'QR B');
    app = await createApp();
    await app.init();
    const customerId = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(a))
        .send({ displayName: 'QR Cust', phone: '0400888000' })
    ).body.id;
    const vehicleId = (
      await http()
        .post(`/api/v1/contacts/${customerId}/vehicles`)
        .set(auth(a))
        .send({ rego: 'QRV1', make: 'VW', model: 'Golf', year: 2019 })
    ).body.id;
    jobId = (
      await http()
        .post('/api/v1/work-items')
        .set(auth(a))
        .send({ type: 'job', fields: { customerId }, subjectIds: [vehicleId] })
    ).body.id;
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      for (const tbl of [
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

  it('revises an accepted quote: original retained, lines copied, totals recompute', async () => {
    // v1: quote with $100 labour → sent → accepted.
    const v1 = (await http().post(`/api/v1/work-items/${jobId}/quotes`).set(auth(a))).body;
    await addLine(v1.id, 'Initial repair', 1, 10000);
    await http()
      .post(`/api/v1/quotes/${v1.id}/status`)
      .set(auth(a))
      .send({ status: 'Sent' })
      .expect(201);
    const acceptedV1 = (
      await http()
        .post(`/api/v1/quotes/${v1.id}/status`)
        .set(auth(a))
        .send({ status: 'Accepted' })
        .expect(201)
    ).body;
    expect(acceptedV1.status).toBe('Accepted');
    expect(acceptedV1.totalCents).toBe(11000); // 10000 + 10% GST

    // Hidden damage found → revise into v2. Original v1 lines copy across.
    const v2 = (await http().post(`/api/v1/quotes/${v1.id}/revise`).set(auth(a)).expect(201)).body;
    expect(v2.revision).toBe(2);
    expect(v2.status).toBe('Draft');
    expect(v2.supersedesId).toBe(v1.id);
    expect(v2.reference).toBe(`${acceptedV1.reference}-r2`);
    expect(v2.lines).toHaveLength(1); // copied from v1
    expect(v2.totalCents).toBe(11000);

    // Add supplementary scope → totals recompute.
    const v2WithScope = (await addLine(v2.id, 'Hidden damage', 1, 5000).expect(201)).body;
    expect(v2WithScope.totalCents).toBe(16500); // (10000 + 5000) + 10% GST

    // The ORIGINAL is retained untouched — still Accepted, still $110, and now marked superseded.
    const originalNow = (await http().get(`/api/v1/quotes/${v1.id}`).set(auth(a)).expect(200)).body;
    expect(originalNow.status).toBe('Accepted');
    expect(originalNow.totalCents).toBe(11000);
    expect(originalNow.supersededById).toBe(v2.id);
    expect(originalNow.lines).toHaveLength(1);

    // The job's quote history shows both.
    const history = (
      await http().get(`/api/v1/work-items/${jobId}/quotes`).set(auth(a)).expect(200)
    ).body;
    expect(history.length).toBeGreaterThanOrEqual(2);
  });

  it('enforces forward-only status and blocks revising a Draft', async () => {
    const draft = (await http().post(`/api/v1/work-items/${jobId}/quotes`).set(auth(a))).body;
    // Can't send an empty quote.
    await http()
      .post(`/api/v1/quotes/${draft.id}/status`)
      .set(auth(a))
      .send({ status: 'Sent' })
      .expect(400);
    // Can't jump Draft → Accepted.
    await addLine(draft.id, 'x', 1, 1000);
    await http()
      .post(`/api/v1/quotes/${draft.id}/status`)
      .set(auth(a))
      .send({ status: 'Accepted' })
      .expect(409);
    // Revising a Draft is refused (just edit it).
    await http().post(`/api/v1/quotes/${draft.id}/revise`).set(auth(a)).expect(409);
  });

  it("is tenant-isolated: shop B cannot revise shop A's quote", async () => {
    const v1 = (await http().post(`/api/v1/work-items/${jobId}/quotes`).set(auth(a))).body;
    await addLine(v1.id, 'Solo', 1, 2000);
    await http().post(`/api/v1/quotes/${v1.id}/status`).set(auth(a)).send({ status: 'Sent' });
    await http().post(`/api/v1/quotes/${v1.id}/revise`).set(auth(b)).expect(404);
  });
});
