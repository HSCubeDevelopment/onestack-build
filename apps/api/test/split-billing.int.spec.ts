// Card #40.5: payer / bill-to + split billing + payments. Party billed ≠ party served is generic
// (insurance, Medicare, NDIS, B2B). Money reconciles to the cent. Tenant-isolated. Supabase HTTP.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Split billing (card #40.5)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let jobId: string;
  let insurerId: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  // A $130 ex-GST invoice ⇒ $143 inc GST (14300c). Built from an accepted quote.
  const invoiceWithTotal = async (): Promise<{ id: string; totalCents: number }> => {
    const quote = (await http().post(`/api/v1/work-items/${jobId}/quotes`).set(auth(a))).body;
    await http()
      .post(`/api/v1/quotes/${quote.id}/lines`)
      .set(auth(a))
      .send({ description: 'Labour', type: 'labour', quantity: 2, unitPriceCents: 5000 });
    await http()
      .post(`/api/v1/quotes/${quote.id}/lines`)
      .set(auth(a))
      .send({ description: 'Bumper', type: 'part', quantity: 1, unitPriceCents: 3000 });
    const inv = (await http().post(`/api/v1/quotes/${quote.id}/invoice`).set(auth(a)).expect(201))
      .body;
    return { id: inv.id, totalCents: inv.totalCents };
  };

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Split A');
    b = await makeTenant(admin, 'Split B');
    app = await createApp();
    await app.init();
    const customerId = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(a))
        .send({ displayName: 'S Cust', phone: '0400111222', email: 'scust@example.com' })
    ).body.id;
    insurerId = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(a))
        .send({ displayName: 'AAMI Insurance', phone: '0132244' })
    ).body.id;
    const vehicleId = (
      await http()
        .post(`/api/v1/contacts/${customerId}/vehicles`)
        .set(auth(a))
        .send({ rego: 'SPL1', make: 'Mazda', model: '3', year: 2020 })
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
        'onestack_payment',
        'onestack_invoice_portion',
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

  it('bills a payer different from the served customer', async () => {
    const { id } = await invoiceWithTotal();
    const view = (
      await http()
        .post(`/api/v1/invoices/${id}/payer`)
        .set(auth(a))
        .send({ payerContactId: insurerId })
        .expect(201)
    ).body;
    expect(view.payerContactId).toBe(insurerId);
  });

  it('splits an invoice into two payer portions that reconcile to the total', async () => {
    const { id, totalCents } = await invoiceWithTotal();
    const excess = 50000 > totalCents ? Math.floor(totalCents / 2) : 50000; // guard, but total is 14300
    const insured = totalCents - excess;
    const view = (
      await http()
        .put(`/api/v1/invoices/${id}/split`)
        .set(auth(a))
        .send({
          portions: [
            { payerContactId: insurerId, description: 'Insurer authorised', amountCents: insured },
            { payerName: 'Customer excess', description: 'Excess', amountCents: excess },
          ],
        })
        .expect(200)
    ).body;
    expect(view.portions).toHaveLength(2);
    expect(
      view.portions.reduce((s: number, p: { amountCents: number }) => s + p.amountCents, 0),
    ).toBe(totalCents);
  });

  it('rejects a split that does not reconcile to the total', async () => {
    const { id, totalCents } = await invoiceWithTotal();
    await http()
      .put(`/api/v1/invoices/${id}/split`)
      .set(auth(a))
      .send({
        portions: [{ payerName: 'Someone', description: 'Wrong', amountCents: totalCents - 1 }],
      })
      .expect(400);
  });

  it('records per-portion payments; fully paid flips the invoice to Paid; over-payment is rejected', async () => {
    const { id, totalCents } = await invoiceWithTotal();
    const excess = 4300;
    const insured = totalCents - excess; // 10000
    await http()
      .put(`/api/v1/invoices/${id}/split`)
      .set(auth(a))
      .send({
        portions: [
          { payerContactId: insurerId, description: 'Insurer', amountCents: insured },
          { payerName: 'Customer excess', description: 'Excess', amountCents: excess },
        ],
      })
      .expect(200);
    const split = (await http().get(`/api/v1/invoices/${id}`).set(auth(a))).body;
    const insurerPortion = split.portions.find(
      (p: { payerContactId: string }) => p.payerContactId === insurerId,
    );
    const excessPortion = split.portions.find(
      (p: { payerName: string }) => p.payerName === 'Customer excess',
    );

    // Insurer pays their portion.
    let view = (
      await http()
        .post(`/api/v1/invoices/${id}/payments`)
        .set(auth(a))
        .send({ amountCents: insured, method: 'bank_transfer', portionId: insurerPortion.id })
        .expect(201)
    ).body;
    expect(view.paidState).toBe('PartiallyPaid');
    expect(view.balanceCents).toBe(excess);

    // Over-paying the excess portion is rejected.
    await http()
      .post(`/api/v1/invoices/${id}/payments`)
      .set(auth(a))
      .send({ amountCents: excess + 100, method: 'card', portionId: excessPortion.id })
      .expect(400);

    // Customer pays their excess in full ⇒ invoice Paid.
    view = (
      await http()
        .post(`/api/v1/invoices/${id}/payments`)
        .set(auth(a))
        .send({ amountCents: excess, method: 'card', portionId: excessPortion.id })
        .expect(201)
    ).body;
    expect(view.paidState).toBe('Paid');
    expect(view.balanceCents).toBe(0);
    expect(view.status).toBe('Paid');

    // Any further payment over-pays the invoice ⇒ rejected.
    await http()
      .post(`/api/v1/invoices/${id}/payments`)
      .set(auth(a))
      .send({ amountCents: 100, method: 'cash' })
      .expect(400);
  });

  it("is tenant-isolated: shop B cannot record a payment on shop A's invoice", async () => {
    const { id } = await invoiceWithTotal();
    await http()
      .post(`/api/v1/invoices/${id}/payments`)
      .set(auth(b))
      .send({ amountCents: 100, method: 'cash' })
      .expect(404);
  });
});
