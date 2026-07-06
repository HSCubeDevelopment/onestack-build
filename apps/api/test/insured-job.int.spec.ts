// Card #15: an insured panel-shop job end-to-end. The claim block is automotive PACK config on the job;
// the money split (insurer authorised vs customer excess) rides on the GENERIC core split-billing
// (#40.5) — no vertical noun in core. Proves the pilot can run a real insured job. Supabase HTTP.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Insured job end-to-end (card #15)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let insurerId: string;
  let customerId: string;
  let jobId: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.staffToken}` });

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Insured A');
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
        .send({ displayName: 'Insured Cust', phone: '0400777888' })
    ).body.id;
    const vehicleId = (
      await http()
        .post(`/api/v1/contacts/${customerId}/vehicles`)
        .set(auth(a))
        .send({ rego: 'INS1', make: 'Subaru', model: 'Impreza', year: 2021 })
    ).body.id;

    // Job created AS an insured job — the claim block is captured on the job's fields.
    jobId = (
      await http()
        .post('/api/v1/work-items')
        .set(auth(a))
        .send({
          type: 'job',
          subjectIds: [vehicleId],
          fields: {
            customerId,
            description: 'Rear-end repair',
            claim: {
              insurer: 'AAMI',
              insurerContactId: insurerId,
              claimNumber: 'CLM-2026-777',
              assessor: 'K. Nguyen',
              dateLodged: '2026-07-02',
              authorisedAmountCents: 12300, // assessor-approved (insurer pays)
              excessCents: 2000, // customer out-of-pocket
              billPayer: 'insurer',
            },
          },
        })
        .expect(201)
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

  it('captures the claim block on the job', async () => {
    const job = (await http().get(`/api/v1/work-items/${jobId}`).set(auth(a)).expect(200)).body;
    expect(job.fields.claim).toMatchObject({
      insurer: 'AAMI',
      claimNumber: 'CLM-2026-777',
      excessCents: 2000,
      billPayer: 'insurer',
    });
  });

  it('runs the insured money flow: insurer billed for authorised, customer pays only the excess', async () => {
    // Quote the repair: labour 2×5000 + part 3000 = 13000 net, +10% GST = 14300 total.
    const quote = (await http().post(`/api/v1/work-items/${jobId}/quotes`).set(auth(a))).body;
    await http()
      .post(`/api/v1/quotes/${quote.id}/lines`)
      .set(auth(a))
      .send({ description: 'Labour', type: 'labour', quantity: 2, unitPriceCents: 5000 });
    await http()
      .post(`/api/v1/quotes/${quote.id}/lines`)
      .set(auth(a))
      .send({ description: 'Rear bar', type: 'part', quantity: 1, unitPriceCents: 3000 });

    const inv = (await http().post(`/api/v1/quotes/${quote.id}/invoice`).set(auth(a)).expect(201))
      .body;
    expect(inv.totalCents).toBe(14300);

    // Bill the insurer, then split authorised (insurer) vs excess (customer) — reconciles to 14300.
    await http()
      .post(`/api/v1/invoices/${inv.id}/payer`)
      .set(auth(a))
      .send({ payerContactId: insurerId })
      .expect(201);
    const split = (
      await http()
        .put(`/api/v1/invoices/${inv.id}/split`)
        .set(auth(a))
        .send({
          portions: [
            { payerContactId: insurerId, description: 'Insurer authorised', amountCents: 12300 },
            { payerContactId: customerId, description: 'Customer excess', amountCents: 2000 },
          ],
        })
        .expect(200)
    ).body;
    const insurerPortion = split.portions.find(
      (p: { payerContactId: string }) => p.payerContactId === insurerId,
    );
    const excessPortion = split.portions.find(
      (p: { payerContactId: string }) => p.payerContactId === customerId,
    );

    // Insurer settles their authorised portion.
    let view = (
      await http()
        .post(`/api/v1/invoices/${inv.id}/payments`)
        .set(auth(a))
        .send({ amountCents: 12300, method: 'bank_transfer', portionId: insurerPortion.id })
        .expect(201)
    ).body;
    expect(view.paidState).toBe('PartiallyPaid');
    expect(view.balanceCents).toBe(2000); // only the excess remains

    // Customer pays ONLY the excess ⇒ invoice fully Paid.
    view = (
      await http()
        .post(`/api/v1/invoices/${inv.id}/payments`)
        .set(auth(a))
        .send({ amountCents: 2000, method: 'card', portionId: excessPortion.id })
        .expect(201)
    ).body;
    expect(view.paidState).toBe('Paid');
    expect(view.status).toBe('Paid');

    // The customer's total outlay was exactly the excess.
    const customerPaid = view.payments
      .filter((p: { portionId: string }) => p.portionId === excessPortion.id)
      .reduce((s: number, p: { amountCents: number }) => s + p.amountCents, 0);
    expect(customerPaid).toBe(2000);
  });
});
