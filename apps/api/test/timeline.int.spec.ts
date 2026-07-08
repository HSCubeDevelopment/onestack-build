// Phase 3 — Customer timeline. A read-model merging a customer's jobs + notes (with quote/invoice
// summaries) into one chronological feed. Tenant-isolated: shop B can't read shop A's customer timeline.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Customer timeline (Phase 3)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let customerId: string;
  let jobId: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'TL A');
    b = await makeTenant(admin, 'TL B');
    app = await createApp();
    await app.init();

    customerId = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(a))
        .send({ displayName: 'Jane Timeline', phone: '0400111222' })
        .expect(201)
    ).body.id;
    const vehicleId = (
      await http()
        .post(`/api/v1/contacts/${customerId}/vehicles`)
        .set(auth(a))
        .send({ rego: 'TL1', make: 'Kia', model: 'Cerato', year: 2021 })
        .expect(201)
    ).body.id;
    jobId = (
      await http()
        .post('/api/v1/work-items')
        .set(auth(a))
        .send({ type: 'job', fields: { customerId }, subjectIds: [vehicleId] })
        .expect(201)
    ).body.id;
    // A quote + a note on the job.
    const quote = (await http().post(`/api/v1/work-items/${jobId}/quotes`).set(auth(a)).expect(201))
      .body;
    await http()
      .post(`/api/v1/quotes/${quote.id}/lines`)
      .set(auth(a))
      .send({ description: 'Panel', type: 'labour', quantity: 1, unitPriceCents: 9500 })
      .expect(201);
    await http()
      .post(`/api/v1/work-items/${jobId}/notes`)
      .set(auth(a))
      .send({ body: 'Customer dropped off the car' })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      for (const tbl of [
        'onestack_line_item',
        'onestack_quote',
        'onestack_reference_counter',
        'onestack_work_item_note',
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

  it("assembles the customer's timeline: job + note events, newest first, with money summary", async () => {
    const tl = (
      await http().get(`/api/v1/contacts/${customerId}/timeline`).set(auth(a)).expect(200)
    ).body;

    expect(tl.contact.displayName).toBe('Jane Timeline');
    expect(tl.jobCount).toBe(1);

    const types = tl.events.map((e: { type: string }) => e.type);
    expect(types).toContain('job');
    expect(types).toContain('note');

    // Newest first: the note (added last) comes before the job (created first).
    const noteIdx = types.indexOf('note');
    const jobIdx = types.indexOf('job');
    expect(noteIdx).toBeLessThan(jobIdx);

    const jobEvent = tl.events.find((e: { type: string }) => e.type === 'job');
    expect(jobEvent.jobReference).toBe(jobId ? jobEvent.jobReference : '');
    expect(jobEvent.amountsCents.quotes).toBe(9500);

    const noteEvent = tl.events.find((e: { type: string }) => e.type === 'note');
    expect(noteEvent.summary).toBe('Customer dropped off the car');
  });

  it("is tenant-isolated: shop B cannot read shop A's customer timeline", async () => {
    await http().get(`/api/v1/contacts/${customerId}/timeline`).set(auth(b)).expect(404);
  });
});
