// INS-2 — "collect the excess before release" gate, end to end against Supabase.
// Proves: a job with an unpaid customer excess CANNOT be moved Ready→Collected; paying the excess
// releases it; an OWNER can waive the hold; STAFF cannot.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Excess-before-release gate (INS-2)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  const http = () => request(app.getHttpServer());
  const owner = () => ({ Authorization: `Bearer ${a.ownerToken}` });
  const staff = () => ({ Authorization: `Bearer ${a.staffToken}` });

  // Stand up an insured job at Ready with a $200 customer excess still owed.
  // Returns the job id, invoice id, and the customer-excess portion id.
  async function seedReadyInsuredJobWithUnpaidExcess() {
    const customerId = (
      await http()
        .post('/api/v1/contacts')
        .set(owner())
        .send({ displayName: 'Owner Driver', phone: '0400111222' })
    ).body.id;
    const insurerId = (
      await http()
        .post('/api/v1/contacts')
        .set(owner())
        .send({ displayName: 'AAMI', phone: '131111' })
    ).body.id;
    const vehicleId = (
      await http()
        .post(`/api/v1/contacts/${customerId}/vehicles`)
        .set(owner())
        .send({ rego: 'INS001', make: 'Mazda', model: '3', year: 2020 })
    ).body.id;
    const job = (
      await http()
        .post('/api/v1/work-items')
        .set(owner())
        .send({ type: 'job', fields: { customerId }, subjectIds: [vehicleId] })
    ).body;
    const inv = (
      await http().post(`/api/v1/work-items/${job.id}/invoices`).set(owner()).send({}).expect(201)
    ).body;
    // $1000 net → $1100 incl GST. Split: $900 insurer authorised + $200 customer excess = $1100.
    await http()
      .post(`/api/v1/invoices/${inv.id}/lines`)
      .set(owner())
      .send({ description: 'Repair', type: 'labour', quantity: 1, unitPriceCents: 100_000 })
      .expect(201);
    const split = (
      await http()
        .post(`/api/v1/invoices/${inv.id}/excess-split`)
        .set(owner())
        .send({
          primaryPayerContactId: insurerId,
          primaryAmountCents: 90_000,
          excessAmountCents: 20_000,
          excessPayerContactId: customerId,
        })
        .expect(201)
    ).body;
    const excessPortionId = split.portions.find(
      (p: { description: string }) => p.description === 'Customer excess',
    ).id;

    // Booked → In progress → Ready.
    await http()
      .post(`/api/v1/work-items/${job.id}/transition`)
      .set(owner())
      .send({ event: 'START' })
      .expect(201);
    await http()
      .post(`/api/v1/work-items/${job.id}/transition`)
      .set(owner())
      .send({ event: 'READY' })
      .expect(201);
    return {
      jobId: job.id as string,
      invoiceId: inv.id as string,
      excessPortionId: excessPortionId as string,
    };
  }

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Excess A');
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    for (const table of [
      'onestack_payment',
      'onestack_invoice_portion',
      'onestack_invoice',
      'onestack_line_item',
      'onestack_work_item_note',
      'onestack_work_item_subject',
      'onestack_work_item',
      'onestack_work_item_counter',
      'onestack_reference_counter',
      'onestack_subject',
      'onestack_contact',
      'onestack_audit_log',
    ]) {
      await admin.$executeRawUnsafe(
        `DELETE FROM "${table}" WHERE "tenantId" = $1::uuid`,
        a.tenantId,
      );
    }
    await dropTenant(admin, a.tenantId);
    await admin.$disconnect();
  });

  it('blocks Ready→Collected while the customer excess is unpaid, then allows it once paid', async () => {
    const { jobId, invoiceId, excessPortionId } = await seedReadyInsuredJobWithUnpaidExcess();

    // COLLECT is refused — the excess is still owed.
    await http()
      .post(`/api/v1/work-items/${jobId}/transition`)
      .set(owner())
      .send({ event: 'COLLECT' })
      .expect(400);
    // The car is still on the floor.
    expect(
      (await http().get(`/api/v1/work-items/${jobId}`).set(owner()).expect(200)).body.stateName,
    ).toBe('Ready');

    // Collect the $200 excess.
    await http()
      .post(`/api/v1/invoices/${invoiceId}/payments`)
      .set(owner())
      .send({ amountCents: 20_000, method: 'card', portionId: excessPortionId })
      .expect(201);

    // Now the car can be released.
    const collected = (
      await http()
        .post(`/api/v1/work-items/${jobId}/transition`)
        .set(owner())
        .send({ event: 'COLLECT' })
        .expect(201)
    ).body;
    expect(collected.stateName).toBe('Collected');
  });

  it('lets an OWNER waive the hold to release a car despite an unpaid excess', async () => {
    const { jobId } = await seedReadyInsuredJobWithUnpaidExcess();

    // Blocked first.
    await http()
      .post(`/api/v1/work-items/${jobId}/transition`)
      .set(owner())
      .send({ event: 'COLLECT' })
      .expect(400);
    // Owner waives the hold (audited).
    await http().post(`/api/v1/work-items/${jobId}/waive-excess-hold`).set(owner()).expect(201);
    // Now it collects.
    const collected = (
      await http()
        .post(`/api/v1/work-items/${jobId}/transition`)
        .set(owner())
        .send({ event: 'COLLECT' })
        .expect(201)
    ).body;
    expect(collected.stateName).toBe('Collected');
  });

  it('does NOT let STAFF waive the hold', async () => {
    const { jobId } = await seedReadyInsuredJobWithUnpaidExcess();
    await http().post(`/api/v1/work-items/${jobId}/waive-excess-hold`).set(staff()).expect(403);
  });
});
