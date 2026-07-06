// Card #42: excess handling. On an insured job, the shop collects the excess from the customer and bills
// the insurer separately, reconciling to the cent — in ONE call driven by the claim figures (#15) via the
// core split-billing machinery (#40.5). Tenant-isolated. Supabase HTTP.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Excess handling (card #42)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let insurerId: string;
  let customerId: string;
  let jobId: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.staffToken}` });

  // Build a $143 (14300c) invoice on an insured job whose claim carries authorised=12300, excess=2000.
  const insuredInvoice = async (): Promise<{ invoiceId: string; totalCents: number }> => {
    const quote = (await http().post(`/api/v1/work-items/${jobId}/quotes`).set(auth(a))).body;
    await http()
      .post(`/api/v1/quotes/${quote.id}/lines`)
      .set(auth(a))
      .send({ description: 'Labour', type: 'labour', quantity: 2, unitPriceCents: 5000 });
    await http()
      .post(`/api/v1/quotes/${quote.id}/lines`)
      .set(auth(a))
      .send({ description: 'Bar', type: 'part', quantity: 1, unitPriceCents: 3000 });
    const inv = (await http().post(`/api/v1/quotes/${quote.id}/invoice`).set(auth(a)).expect(201))
      .body;
    return { invoiceId: inv.id, totalCents: inv.totalCents };
  };

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Excess A');
    app = await createApp();
    await app.init();
    insurerId = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(a))
        .send({ displayName: 'AAMI', phone: '0132244' })
    ).body.id;
    customerId = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(a))
        .send({ displayName: 'Excess Cust', phone: '0400900900' })
    ).body.id;
    const vehicleId = (
      await http()
        .post(`/api/v1/contacts/${customerId}/vehicles`)
        .set(auth(a))
        .send({ rego: 'EXC1', make: 'Nissan', model: 'X-Trail', year: 2020 })
    ).body.id;
    jobId = (
      await http()
        .post('/api/v1/work-items')
        .set(auth(a))
        .send({
          type: 'job',
          subjectIds: [vehicleId],
          fields: {
            customerId,
            claim: {
              insurer: 'AAMI',
              insurerContactId: insurerId,
              claimNumber: 'CLM-42',
              authorisedAmountCents: 12300,
              excessCents: 2000,
              billPayer: 'insurer',
            },
          },
        })
    ).body.id;
  });

  afterAll(async () => {
    await app.close();
    for (const tbl of [
      'onestack_payment',
      'onestack_invoice_portion',
      'onestack_line_item',
      'onestack_invoice',
      'onestack_quote',
      'onestack_reference_counter',
      'onestack_work_item_subject',
      'onestack_work_item',
      'onestack_work_item_counter',
      'onestack_subject',
      'onestack_contact',
    ]) {
      await admin.$executeRawUnsafe(`DELETE FROM "${tbl}" WHERE "tenantId" = $1::uuid`, a.tenantId);
    }
    await dropTenant(admin, a.tenantId);
    await admin.$disconnect();
  });

  it('applies the insurer/excess split in one call from the claim figures', async () => {
    const { invoiceId } = await insuredInvoice();
    const job = (await http().get(`/api/v1/work-items/${jobId}`).set(auth(a))).body;
    const claim = job.fields.claim;

    const view = (
      await http()
        .post(`/api/v1/invoices/${invoiceId}/excess-split`)
        .set(auth(a))
        .send({
          primaryPayerContactId: claim.insurerContactId,
          primaryAmountCents: claim.authorisedAmountCents,
          excessAmountCents: claim.excessCents,
          excessPayerContactId: customerId,
        })
        .expect(201)
    ).body;

    expect(view.payerContactId).toBe(insurerId);
    expect(view.portions).toHaveLength(2);
    const insurerPortion = view.portions.find(
      (p: { payerContactId: string }) => p.payerContactId === insurerId,
    );
    const excessPortion = view.portions.find(
      (p: { payerContactId: string }) => p.payerContactId === customerId,
    );
    expect(insurerPortion.amountCents).toBe(12300);
    expect(excessPortion.amountCents).toBe(2000);
    // Reconciles to the cent.
    expect(insurerPortion.amountCents + excessPortion.amountCents).toBe(view.totalCents);
  });

  it('collects the excess from the customer and bills the insurer separately; reconciles to Paid', async () => {
    const { invoiceId } = await insuredInvoice();
    await http()
      .post(`/api/v1/invoices/${invoiceId}/excess-split`)
      .set(auth(a))
      .send({
        primaryPayerContactId: insurerId,
        primaryAmountCents: 12300,
        excessAmountCents: 2000,
        excessPayerContactId: customerId,
      })
      .expect(201);
    const split = (await http().get(`/api/v1/invoices/${invoiceId}`).set(auth(a))).body;
    const excessPortion = split.portions.find(
      (p: { payerContactId: string }) => p.payerContactId === customerId,
    );

    // Customer pays only their excess.
    let view = (
      await http()
        .post(`/api/v1/invoices/${invoiceId}/payments`)
        .set(auth(a))
        .send({ amountCents: 2000, method: 'card', portionId: excessPortion.id })
        .expect(201)
    ).body;
    expect(view.paidState).toBe('PartiallyPaid');
    expect(view.balanceCents).toBe(12300); // insurer still owes their portion

    // Insurer settles the rest → Paid, reconciled.
    const insurerPortion = split.portions.find(
      (p: { payerContactId: string }) => p.payerContactId === insurerId,
    );
    view = (
      await http()
        .post(`/api/v1/invoices/${invoiceId}/payments`)
        .set(auth(a))
        .send({ amountCents: 12300, method: 'bank_transfer', portionId: insurerPortion.id })
        .expect(201)
    ).body;
    expect(view.paidState).toBe('Paid');
    expect(view.balanceCents).toBe(0);
  });

  it('rejects an excess split that does not reconcile to the invoice total', async () => {
    const { invoiceId } = await insuredInvoice();
    await http()
      .post(`/api/v1/invoices/${invoiceId}/excess-split`)
      .set(auth(a))
      .send({
        primaryPayerContactId: insurerId,
        primaryAmountCents: 12300,
        excessAmountCents: 1, // 12301 ≠ 14300
        excessPayerContactId: customerId,
      })
      .expect(400);
  });
});
