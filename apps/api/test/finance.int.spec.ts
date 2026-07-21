// FIN-1 — Money & Payments overview, end to end against Supabase.
// Proves: the endpoint aggregates this tenant's invoices, it is OWNER-only (money hidden from staff),
// and it is tenant-isolated (shop B's money picture never includes shop A's invoices).
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Money & Payments overview (FIN-1)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  const http = () => request(app.getHttpServer());
  const owner = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });
  const staff = (t: TestTenant) => ({ Authorization: `Bearer ${t.staffToken}` });

  // Stand up an unpaid invoice worth `cents` on a fresh job, so the tenant has real money owed.
  async function seedOwedInvoice(t: TestTenant, cents: number): Promise<void> {
    const customerId = (
      await http()
        .post('/api/v1/contacts')
        .set(owner(t))
        .send({ displayName: 'Payer', phone: '0400000000' })
    ).body.id;
    const vehicleId = (
      await http()
        .post(`/api/v1/contacts/${customerId}/vehicles`)
        .set(owner(t))
        .send({ rego: 'FIN001', make: 'Mazda', model: '3', year: 2020 })
    ).body.id;
    const job = (
      await http()
        .post('/api/v1/work-items')
        .set(owner(t))
        .send({ type: 'job', fields: { customerId }, subjectIds: [vehicleId] })
    ).body;
    const inv = (
      await http().post(`/api/v1/work-items/${job.id}/invoices`).set(owner(t)).send({}).expect(201)
    ).body;
    await http()
      .post(`/api/v1/invoices/${inv.id}/lines`)
      .set(owner(t))
      .send({ description: 'Repair', type: 'labour', quantity: 1, unitPriceCents: cents })
      .expect(201);
  }

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Money A');
    b = await makeTenant(admin, 'Money B');
    app = await createApp();
    await app.init();
    await seedOwedInvoice(a, 50_000); // $500 net → $550 owed incl. GST, in shop A only
  });

  afterAll(async () => {
    await app.close();
    // Clear the money/job rows this spec created (child → parent) so the tenant can be dropped.
    for (const t of [a.tenantId, b.tenantId]) {
      for (const table of [
        'onestack_payment',
        'onestack_invoice_portion',
        'onestack_invoice',
        'onestack_line_item',
        'onestack_work_item_subject',
        'onestack_work_item',
        'onestack_work_item_counter',
        'onestack_reference_counter',
        'onestack_subject',
        'onestack_contact',
      ]) {
        await admin.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "tenantId" = $1::uuid`, t);
      }
    }
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  it('gives the owner a money picture aggregated from this shop’s invoices', async () => {
    const o = (await http().get('/api/v1/finance/overview').set(owner(a)).expect(200)).body;
    // $500 net + 10% GST = $550 owed, consistent with the app's existing outstanding calc.
    expect(o.owedCents).toBe(55_000);
    expect(o.pipeline.invoicedAwaitingCents).toBe(55_000);
    // Shape sanity — the panels the Money page renders.
    expect(o).toHaveProperty('agingByPayer.insurer');
    expect(o).toHaveProperty('agingByPayer.customer');
    expect(Array.isArray(o.insurerScorecard)).toBe(true);
    expect(o).toHaveProperty('needsChasing.overdueCents');
    // A single-payer invoice is customer money, aged from issue (no due date) into the 0–30 bucket.
    expect(o.agingByPayer.customer.d0_30).toBe(55_000);
  });

  it('is OWNER-only — money is hidden from staff', async () => {
    await http().get('/api/v1/finance/overview').set(staff(a)).expect(403);
  });

  it('is tenant-isolated — shop B’s money picture is empty', async () => {
    const o = (await http().get('/api/v1/finance/overview').set(owner(b)).expect(200)).body;
    expect(o.owedCents).toBe(0);
    expect(o.needsChasing.overdueCount).toBe(0);
    expect(o.insurerScorecard).toEqual([]);
  });
});
