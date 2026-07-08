// Phase 3 — Digital intake & forms. Define a custom form, submit it against a customer (answers land on
// the customer record), read the customer's submissions. Tenant-isolated.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Digital intake & forms (Phase 3)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let formId: string;
  let contactId: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Intake A');
    b = await makeTenant(admin, 'Intake B');
    app = await createApp();
    await app.init();
    contactId = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(a))
        .send({ displayName: 'Jane Intake', phone: '0400333111' })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      for (const tbl of [
        'onestack_intake_submission',
        'onestack_intake_form',
        'onestack_contact',
      ]) {
        await admin.$executeRawUnsafe(`DELETE FROM "${tbl}" WHERE "tenantId" = $1::uuid`, t);
      }
    }
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  it('creates a form; rejects an invalid field set', async () => {
    const form = (
      await http()
        .post('/api/v1/intake-forms')
        .set(auth(a))
        .send({
          name: 'Pre-visit check-in',
          fields: [
            { key: 'symptom', label: 'Main symptom', type: 'text', required: true },
            {
              key: 'urgency',
              label: 'Urgency',
              type: 'select',
              required: false,
              options: ['Low', 'High'],
            },
          ],
        })
        .expect(201)
    ).body;
    formId = form.id;
    expect(form.fields).toHaveLength(2);

    // A select without options is rejected.
    await http()
      .post('/api/v1/intake-forms')
      .set(auth(a))
      .send({ name: 'Bad', fields: [{ key: 'x', label: 'X', type: 'select' }] })
      .expect(400);
  });

  it('submits a completed form against a customer; the answers land on their record', async () => {
    const sub = (
      await http()
        .post(`/api/v1/contacts/${contactId}/intake/${formId}`)
        .set(auth(a))
        .send({ answers: { symptom: 'Grinding noise', urgency: 'High' } })
        .expect(201)
    ).body;
    expect(sub.contactId).toBe(contactId);
    expect(sub.formName).toBe('Pre-visit check-in');
    expect(sub.answers).toEqual({ symptom: 'Grinding noise', urgency: 'High' });

    // It appears on the customer's record.
    const list = (
      await http().get(`/api/v1/contacts/${contactId}/intake-submissions`).set(auth(a)).expect(200)
    ).body;
    expect(list).toHaveLength(1);
    expect(list[0].answers.symptom).toBe('Grinding noise');

    // Missing required answer + a bad select value are rejected.
    await http()
      .post(`/api/v1/contacts/${contactId}/intake/${formId}`)
      .set(auth(a))
      .send({ answers: { urgency: 'High' } })
      .expect(400);
    await http()
      .post(`/api/v1/contacts/${contactId}/intake/${formId}`)
      .set(auth(a))
      .send({ answers: { symptom: 'x', urgency: 'Medium' } })
      .expect(400);
  });

  it("is tenant-isolated: shop B cannot see A's forms, submit against A's contact, or read its submissions", async () => {
    // B's form catalogue is empty.
    expect((await http().get('/api/v1/intake-forms').set(auth(b)).expect(200)).body).toHaveLength(
      0,
    );
    // B can't read A's form, submit against A's contact, or read its submissions.
    await http().get(`/api/v1/intake-forms/${formId}`).set(auth(b)).expect(404);
    await http()
      .post(`/api/v1/contacts/${contactId}/intake/${formId}`)
      .set(auth(b))
      .send({ answers: { symptom: 'x' } })
      .expect(404);
    await http().get(`/api/v1/contacts/${contactId}/intake-submissions`).set(auth(b)).expect(404);
  });
});
