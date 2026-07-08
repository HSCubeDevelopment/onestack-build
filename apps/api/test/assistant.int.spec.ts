// Phase 3 — AI assistant / receptionist. Ask a question and get an AI-DRAFTED reply (deterministic stub
// in CI — no key), grounded on an optional job/customer, logged and always a draft. Tenant-isolated.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('AI assistant (Phase 3)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let jobId: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Assist A');
    b = await makeTenant(admin, 'Assist B');
    app = await createApp();
    await app.init();

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
        .send({ rego: 'ABC123', make: 'Mazda', model: 'CX-5', year: 2021 })
        .expect(201)
    ).body.id;
    jobId = (
      await http()
        .post('/api/v1/work-items')
        .set(auth(a))
        .send({ type: 'job', fields: { customerId: contactId }, subjectIds: [vehicleId] })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      for (const tbl of [
        'onestack_assistant_message',
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

  it('drafts a reply (stub model in CI), grounded on the job, and marks it a draft', async () => {
    const res = (
      await http()
        .post('/api/v1/ai-assistant/ask')
        .set(auth(a))
        .send({ question: 'When will my car be ready?', workItemId: jobId })
        .expect(201)
    ).body;
    expect(res.draft).toBe(true);
    expect(res.model).toBe('stub'); // no ANTHROPIC_API_KEY in CI
    expect(res.answer).toContain('When will my car be ready?');
    expect(res.workItemId).toBe(jobId);
  });

  it('rejects an empty question and an over-long one', async () => {
    await http().post('/api/v1/ai-assistant/ask').set(auth(a)).send({ question: '' }).expect(400);
    await http()
      .post('/api/v1/ai-assistant/ask')
      .set(auth(a))
      .send({ question: 'x'.repeat(2001) })
      .expect(400);
  });

  it('logs asks (newest first)', async () => {
    await http()
      .post('/api/v1/ai-assistant/ask')
      .set(auth(a))
      .send({ question: 'Do you do insurance work?' })
      .expect(201);
    const log = (await http().get('/api/v1/ai-assistant/messages').set(auth(a)).expect(200)).body;
    expect(log.length).toBeGreaterThanOrEqual(2);
    expect(log[0].question).toBe('Do you do insurance work?');
    expect(log[0].draft).toBe(true);
  });

  it("is tenant-isolated: shop B sees none of A's messages and can't target A's job", async () => {
    expect((await http().get('/api/v1/ai-assistant/messages').set(auth(b)).expect(200)).body).toHaveLength(
      0,
    );
    // B referencing A's job is a 404 (job not visible to B).
    await http()
      .post('/api/v1/ai-assistant/ask')
      .set(auth(b))
      .send({ question: 'hi', workItemId: jobId })
      .expect(404);
  });
});
