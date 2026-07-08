// Phase 3 — Reporting & dashboards (card #145). One read-only overview: revenue, jobs, turnaround and
// utilisation over a period. Composes existing services; owns nothing; never modifies the money engine.
// Proves the wiring + tenant isolation (the metric maths are covered by unit tests).
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { FeatureFlagService } from '../src/composition/feature-flag.service';
import { TenantService } from '../src/tenancy/tenant.service';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Reporting & dashboards (Phase 3)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Report A');
    b = await makeTenant(admin, 'Report B');
    app = await createApp();
    await app.init();
    const flags = new FeatureFlagService(new TenantService());
    await flags.setEnabled(a.tenantId, 'scheduling', true);
    await flags.setEnabled(b.tenantId, 'scheduling', true);

    const contactId = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(a))
        .send({ displayName: 'Customer', phone: '0400000000' })
        .expect(201)
    ).body.id;
    const vehicleId = (
      await http()
        .post(`/api/v1/contacts/${contactId}/vehicles`)
        .set(auth(a))
        .send({ rego: 'RPT145', make: 'Kia', model: 'Cerato', year: 2020 })
        .expect(201)
    ).body.id;
    await http()
      .post('/api/v1/work-items')
      .set(auth(a))
      .send({ type: 'job', fields: { customerId: contactId }, subjectIds: [vehicleId] })
      .expect(201);
    await http().post('/api/v1/resources').set(auth(a)).send({ type: 'bay', name: 'Bay 1' }).expect(201);
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

  it('returns a composed overview: revenue, jobs, turnaround, utilisation', async () => {
    const r = (await http().get('/api/v1/reports/overview').set(auth(a)).expect(200)).body;
    expect(typeof r.from).toBe('string');
    expect(typeof r.to).toBe('string');
    expect(typeof r.revenue.receivedCents).toBe('number');
    expect(typeof r.revenue.outstandingCents).toBe('number');
    expect(r.jobs.total).toBe(1);
    expect(r.jobs.active).toBe(1); // the fresh job is not in a final state
    expect(r.jobs.createdInPeriod).toBe(1);
    expect(r.turnaround.approximate).toBe(true);
    expect(r.utilisation.resourceCount).toBe(1);
    expect(r.utilisation.hoursPerDay).toBe(8);
  });

  it('rejects an invalid from date', async () => {
    await http().get('/api/v1/reports/overview?from=not-a-date').set(auth(a)).expect(400);
  });

  it('is tenant-isolated: shop B sees its own (empty) numbers, not shop A', async () => {
    const r = (await http().get('/api/v1/reports/overview').set(auth(b)).expect(200)).body;
    expect(r.jobs.total).toBe(0);
    expect(r.utilisation.resourceCount).toBe(0);
  });
});
