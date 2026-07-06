// Card #40: Invoice from a job / accepted quote. Money exact; mark-paid records who + when. Supabase HTTP.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Invoice (card #40)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let jobId: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.staffToken}` });

  const quoteWithLines = async (): Promise<string> => {
    const quote = (await http().post(`/api/v1/work-items/${jobId}/quotes`).set(auth(a))).body;
    await http()
      .post(`/api/v1/quotes/${quote.id}/lines`)
      .set(auth(a))
      .send({ description: 'Labour', type: 'labour', quantity: 2, unitPriceCents: 5000 });
    await http()
      .post(`/api/v1/quotes/${quote.id}/lines`)
      .set(auth(a))
      .send({ description: 'Bumper', type: 'part', quantity: 1, unitPriceCents: 3000 });
    return quote.id;
  };

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Inv A');
    b = await makeTenant(admin, 'Inv B');
    app = await createApp();
    await app.init();
    const customerId = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(a))
        .send({ displayName: 'I Cust', phone: '0400999000', email: 'cust@example.com' })
    ).body.id;
    const vehicleId = (
      await http()
        .post(`/api/v1/contacts/${customerId}/vehicles`)
        .set(auth(a))
        .send({ rego: 'INV1', make: 'Kia', model: 'Rio', year: 2018 })
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
        'onestack_invoice',
        'onestack_quote',
        'onestack_notification',
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

  it('creates an invoice from an accepted quote — line items copy across, totals match', async () => {
    const quoteId = await quoteWithLines();
    const inv = (
      await http()
        .post(`/api/v1/quotes/${quoteId}/invoice`)
        .set(auth(a))
        .send({ dueDate: '2026-08-01' })
        .expect(201)
    ).body;
    expect(inv.reference).toMatch(/^INV-\d{6}$/);
    expect(inv).toMatchObject({
      status: 'Unpaid',
      quoteId,
      subtotalCents: 13000,
      gstCents: 1300,
      totalCents: 14300,
    });
    expect(inv.lines).toHaveLength(2);
    expect(inv.subtotalCents + inv.gstCents).toBe(inv.totalCents);
  });

  it('marks an invoice Paid (records who + when); then it is no longer editable; can be voided; sends', async () => {
    const inv = (
      await http()
        .post(`/api/v1/quotes/${await quoteWithLines()}/invoice`)
        .set(auth(a))
        .expect(201)
    ).body;
    await http()
      .post(`/api/v1/invoices/${inv.id}/send`)
      .set(auth(a))
      .expect(201)
      .expect((r) => expect(r.body).toEqual({ sent: true }));

    const paid = (
      await http().post(`/api/v1/invoices/${inv.id}/mark-paid`).set(auth(a)).expect(201)
    ).body;
    expect(paid.status).toBe('Paid');
    expect(paid.paidBy).toBe(a.staffUserId);
    expect(paid.paidAt).toBeTruthy();

    // Editing a Paid invoice is prevented.
    await http()
      .post(`/api/v1/invoices/${inv.id}/lines`)
      .set(auth(a))
      .send({ description: 'x', type: 'part', quantity: 1, unitPriceCents: 100 })
      .expect(409);
    // Paying again is prevented.
    await http().post(`/api/v1/invoices/${inv.id}/mark-paid`).set(auth(a)).expect(409);
    // But it can be voided.
    expect(
      (await http().post(`/api/v1/invoices/${inv.id}/void`).set(auth(a)).expect(201)).body.status,
    ).toBe('Void');
  });

  it('blocks marking/sending an invoice with no line items', async () => {
    const empty = (
      await http().post(`/api/v1/work-items/${jobId}/invoices`).set(auth(a)).send({}).expect(201)
    ).body;
    await http().post(`/api/v1/invoices/${empty.id}/mark-paid`).set(auth(a)).expect(400);
    await http().post(`/api/v1/invoices/${empty.id}/send`).set(auth(a)).expect(400);
  });

  it("is tenant-isolated: shop B cannot see shop A's invoice", async () => {
    const inv = (
      await http()
        .post(`/api/v1/quotes/${await quoteWithLines()}/invoice`)
        .set(auth(a))
        .expect(201)
    ).body;
    await http().get(`/api/v1/invoices/${inv.id}`).set(auth(b)).expect(404);
  });
});
