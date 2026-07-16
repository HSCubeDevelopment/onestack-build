// Card #30: Quote from a job (line items + pricing). Money maths must be exact. HTTP against Supabase.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Quote from a job (card #30)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let jobId: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Quote A');
    b = await makeTenant(admin, 'Quote B');
    app = await createApp();
    await app.init();
    const customerId = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(a))
        .send({ displayName: 'Q Cust', phone: '0400777888' })
    ).body.id;
    const vehicleId = (
      await http()
        .post(`/api/v1/contacts/${customerId}/vehicles`)
        .set(auth(a))
        .send({ rego: 'QUO1', make: 'Ford', model: 'Ranger', year: 2020 })
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

  it('creates a Draft quote with a Q- number; adds lines with exact GST totals', async () => {
    const quote = (await http().post(`/api/v1/work-items/${jobId}/quotes`).set(auth(a)).expect(201))
      .body;
    expect(quote.reference).toMatch(/^Q-\d{6}$/);
    expect(quote).toMatchObject({ status: 'Draft', subtotalCents: 0, gstCents: 0, totalCents: 0 });

    // Labour: 2 × $50.00 ex-GST → net 10000, gst 1000, total 11000
    let q = (
      await http()
        .post(`/api/v1/quotes/${quote.id}/lines`)
        .set(auth(a))
        .send({ description: 'Labour', type: 'labour', quantity: 2, unitPriceCents: 5000 })
        .expect(201)
    ).body;
    // Part: 1 × $30.00 → net 3000, gst 300, total 3300
    q = (
      await http()
        .post(`/api/v1/quotes/${quote.id}/lines`)
        .set(auth(a))
        .send({ description: 'Bumper', type: 'part', quantity: 1, unitPriceCents: 3000 })
        .expect(201)
    ).body;

    expect(q).toMatchObject({ subtotalCents: 13000, gstCents: 1300, totalCents: 14300 });
    expect(q.subtotalCents + q.gstCents).toBe(q.totalCents); // exact
    expect(q.lines).toHaveLength(2);
  });

  it('edits and removes lines; totals recalculate; zero/negative blocked', async () => {
    const quote = (await http().post(`/api/v1/work-items/${jobId}/quotes`).set(auth(a)).expect(201))
      .body;
    const q1 = (
      await http()
        .post(`/api/v1/quotes/${quote.id}/lines`)
        .set(auth(a))
        .send({ description: 'L', type: 'labour', quantity: 2, unitPriceCents: 5000 })
        .expect(201)
    ).body;
    const q2 = (
      await http()
        .post(`/api/v1/quotes/${quote.id}/lines`)
        .set(auth(a))
        .send({ description: 'P', type: 'part', quantity: 1, unitPriceCents: 3000 })
        .expect(201)
    ).body;

    // Edit the labour line to qty 1 → net 5000, gst 500. Totals: subtotal 8000, gst 800, total 8800.
    const edited = (
      await http()
        .patch(`/api/v1/quotes/${quote.id}/lines/${q2.lines[0].id}`)
        .set(auth(a))
        .send({ quantity: 1 })
        .expect(200)
    ).body;
    expect(edited).toMatchObject({ subtotalCents: 8000, gstCents: 800, totalCents: 8800 });

    // Remove the part line → subtotal 5000.
    const removed = (
      await http()
        .delete(`/api/v1/quotes/${quote.id}/lines/${q2.lines[1].id}`)
        .set(auth(a))
        .expect(200)
    ).body;
    expect(removed.subtotalCents).toBe(5000);

    // Zero / negative blocked.
    await http()
      .post(`/api/v1/quotes/${quote.id}/lines`)
      .set(auth(a))
      .send({ description: 'x', type: 'part', quantity: 0, unitPriceCents: 100 })
      .expect(400);
    await http()
      .post(`/api/v1/quotes/${quote.id}/lines`)
      .set(auth(a))
      .send({ description: 'x', type: 'part', quantity: 1, unitPriceCents: 0 })
      .expect(400);
    void q1;
  });

  it("is tenant-isolated: shop B cannot see shop A's quote", async () => {
    const quote = (await http().post(`/api/v1/work-items/${jobId}/quotes`).set(auth(a)).expect(201))
      .body;
    await http().get(`/api/v1/quotes/${quote.id}`).set(auth(b)).expect(404);
  });
});
