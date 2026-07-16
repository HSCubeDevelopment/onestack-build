// Card #52: thin owner dashboard. Jobs by state, total unpaid, this-week revenue — read-only, correct,
// and tenant-scoped. Supabase HTTP.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Owner dashboard (card #52)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  const makeJob = async (t: TestTenant, rego: string): Promise<string> => {
    const customerId = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(t))
        .send({ displayName: 'D', phone: '0400000001' })
    ).body.id;
    const vehicleId = (
      await http()
        .post(`/api/v1/contacts/${customerId}/vehicles`)
        .set(auth(t))
        .send({ rego, make: 'Kia', model: 'Cerato', year: 2020 })
    ).body.id;
    return (
      await http()
        .post('/api/v1/work-items')
        .set(auth(t))
        .send({ type: 'job', fields: { customerId }, subjectIds: [vehicleId] })
    ).body.id;
  };

  const invoiceFor = async (jobId: string, cents: number): Promise<string> => {
    const quote = (await http().post(`/api/v1/work-items/${jobId}/quotes`).set(auth(a))).body;
    await http()
      .post(`/api/v1/quotes/${quote.id}/lines`)
      .set(auth(a))
      .send({ description: 'Work', type: 'labour', quantity: 1, unitPriceCents: cents });
    return (await http().post(`/api/v1/quotes/${quote.id}/invoice`).set(auth(a)).expect(201)).body
      .id;
  };

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Dash A');
    b = await makeTenant(admin, 'Dash B');
    app = await createApp();
    await app.init();
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

  it('reports jobs by state, total unpaid, and this-week revenue — correctly', async () => {
    // Two jobs: one moved to InProgress, one left Booked.
    const j1 = await makeJob(a, 'DSH1');
    await makeJob(a, 'DSH2');
    await http()
      .post(`/api/v1/board/cards/${j1}/move`)
      .set(auth(a))
      .send({ targetState: 'InProgress' });

    // Two invoices totalling 100 + 200 (ex GST) = 110 + 220 = 330 inc GST outstanding.
    const inv1 = await invoiceFor(j1, 10000); // 11000 inc GST
    await invoiceFor(j1, 20000); // 22000 inc GST

    // Pay part of inv1: 5000 → revenue this week 5000; outstanding 33000 - 5000 = 28000.
    await http()
      .post(`/api/v1/invoices/${inv1}/payments`)
      .set(auth(a))
      .send({ amountCents: 5000, method: 'cash' })
      .expect(201);

    const s = (await http().get('/api/v1/dashboard/summary').set(auth(a)).expect(200)).body;
    expect(s.jobsByState.Booked).toBe(1);
    expect(s.jobsByState.InProgress).toBe(1);
    expect(s.activeJobs).toBe(2); // neither is in a final state
    expect(s.totalUnpaidCents).toBe(33000 - 5000);
    expect(s.thisWeekRevenueCents).toBe(5000);
    expect(s.weekStart).toBeTruthy();
  });

  it('is tenant-isolated: shop B sees zeros for shop A activity', async () => {
    const s = (await http().get('/api/v1/dashboard/summary').set(auth(b)).expect(200)).body;
    expect(s.activeJobs).toBe(0);
    expect(s.totalUnpaidCents).toBe(0);
    expect(s.thisWeekRevenueCents).toBe(0);
    expect(s.jobsByState).toEqual({});
  });
});
