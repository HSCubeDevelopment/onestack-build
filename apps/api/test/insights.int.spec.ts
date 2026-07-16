// Phase 3 — AI insights & prediction (card #142). Reads existing data to rank upcoming appointments by
// no-show risk, flag churn-risk customers with a DRAFT re-engagement message, and summarise a customer's
// activity. Deterministic + explainable; stores nothing. Tenant-isolated (via the underlying services).
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { FeatureFlagService } from '../src/composition/feature-flag.service';
import { TenantService } from '../src/tenancy/tenant.service';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('AI insights & prediction (Phase 3)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let contactId: string;
  let jobId: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Insight A');
    b = await makeTenant(admin, 'Insight B');
    app = await createApp();
    await app.init();
    // Scheduling (resources/bookings) sits behind a feature flag; both shops turn it on.
    const flags = new FeatureFlagService(new TenantService());
    await flags.setEnabled(a.tenantId, 'scheduling', true);
    await flags.setEnabled(b.tenantId, 'scheduling', true);

    contactId = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(a))
        .send({ displayName: 'Regular Customer', phone: '0400000000' })
        .expect(201)
    ).body.id;
    const vehicleId = (
      await http()
        .post(`/api/v1/contacts/${contactId}/vehicles`)
        .set(auth(a))
        .send({ rego: 'INS142', make: 'Mazda', model: 'CX-5', year: 2021 })
        .expect(201)
    ).body.id;
    jobId = (
      await http()
        .post('/api/v1/work-items')
        .set(auth(a))
        .send({ type: 'job', fields: { customerId: contactId }, subjectIds: [vehicleId] })
        .expect(201)
    ).body.id;
    const bayId = (
      await http()
        .post('/api/v1/resources')
        .set(auth(a))
        .send({ type: 'bay', name: 'Bay 1' })
        .expect(201)
    ).body.id;
    // A booking well in the future — always "upcoming" relative to the test clock.
    await http()
      .post('/api/v1/bookings')
      .set(auth(a))
      .send({
        resourceId: bayId,
        title: 'Scheduled repair',
        startsAt: '2027-01-10T09:00:00.000Z',
        endsAt: '2027-01-10T11:00:00.000Z',
        workItemId: jobId,
      })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      for (const tbl of [
        'onestack_booking',
        'onestack_resource',
        'onestack_work_item_subject',
        'onestack_work_item',
        'onestack_work_item_counter',
        'onestack_subject',
        'onestack_contact',
        'onestack_feature_flag',
      ]) {
        await admin.$executeRawUnsafe(`DELETE FROM "${tbl}" WHERE "tenantId" = $1::uuid`, t);
      }
    }
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  it('ranks the upcoming appointment by no-show risk, with reasons and the resolved customer', async () => {
    const risks = (await http().get('/api/v1/insights/no-show-risk').set(auth(a)).expect(200)).body;
    expect(risks.length).toBe(1);
    const r = risks[0];
    expect(r.bookingId).toBeTruthy();
    expect(r.contactId).toBe(contactId);
    expect(['low', 'medium', 'high']).toContain(r.level);
    expect(typeof r.score).toBe('number');
    // First-timer booked well in advance → at least one explanation is present.
    expect(Array.isArray(r.reasons)).toBe(true);
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it('summarises a customer activity deterministically', async () => {
    const s = (
      await http().get(`/api/v1/insights/contacts/${contactId}/summary`).set(auth(a)).expect(200)
    ).body;
    expect(s.contactId).toBe(contactId);
    expect(s.jobCount).toBe(1);
    expect(s.summary).toContain('Regular Customer');
    expect(s.lastActivityAt).toBeTruthy();
  });

  it('exposes churn-risk as a list (recent customers are not flagged)', async () => {
    const churn = (await http().get('/api/v1/insights/churn-risk').set(auth(a)).expect(200)).body;
    expect(Array.isArray(churn)).toBe(true);
    // The only customer was just created, so they are not overdue → not flagged.
    expect(churn).toHaveLength(0);
  });

  it("is tenant-isolated: shop B sees no signals and can't read shop A's customer summary", async () => {
    expect(
      (await http().get('/api/v1/insights/no-show-risk').set(auth(b)).expect(200)).body,
    ).toHaveLength(0);
    expect(
      (await http().get('/api/v1/insights/churn-risk').set(auth(b)).expect(200)).body,
    ).toHaveLength(0);
    await http().get(`/api/v1/insights/contacts/${contactId}/summary`).set(auth(b)).expect(404);
  });
});
