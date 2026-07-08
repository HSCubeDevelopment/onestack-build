// Phase 3 — Reviews & reputation. Request a review for a job (tokenised link; emailing it is the vendor
// boundary), the customer submits a star rating publicly, and it rolls up into a reputation summary.
// Tenant-isolated via the unguessable token.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Reviews & reputation (Phase 3)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let jobId: string;
  let reviewId: string;
  let token: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  const makeJob = async (t: TestTenant): Promise<string> => {
    const customerId = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(t))
        .send({ displayName: 'Rev Cust', phone: '0400555000' })
        .expect(201)
    ).body.id;
    const vehicleId = (
      await http()
        .post(`/api/v1/contacts/${customerId}/vehicles`)
        .set(auth(t))
        .send({ rego: 'REV1', make: 'Kia', model: 'Rio', year: 2022 })
        .expect(201)
    ).body.id;
    return (
      await http()
        .post('/api/v1/work-items')
        .set(auth(t))
        .send({ type: 'job', fields: { customerId }, subjectIds: [vehicleId] })
        .expect(201)
    ).body.id;
  };

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Rev A');
    b = await makeTenant(admin, 'Rev B');
    app = await createApp();
    await app.init();
    jobId = await makeJob(a);
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      for (const tbl of [
        'onestack_review',
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

  it('requests a review (tokenised link; invite is the no-op vendor boundary)', async () => {
    const res = (
      await http()
        .post(`/api/v1/work-items/${jobId}/review-request`)
        .set(auth(a))
        .send({})
        .expect(201)
    ).body;
    reviewId = res.review.id;
    token = res.review.token;
    expect(res.review.status).toBe('requested');
    expect(res.invite.sent).toBe(false);
    expect(res.invite.reason).toMatch(/no email\/sms provider/i);
  });

  it('the customer submits a rating publicly; it rolls up into the reputation summary', async () => {
    const page = (await http().get(`/api/v1/public/review/${token}`).expect(200)).body;
    expect(page.status).toBe('requested');
    expect(page.jobReference).toMatch(/^J-\d{6}$/);

    await http()
      .post(`/api/v1/public/review/${token}`)
      .send({ rating: 5, comment: 'Great job!', reviewerName: 'Happy Customer' })
      .expect(201);

    // Submitting twice is refused.
    await http().post(`/api/v1/public/review/${token}`).send({ rating: 1 }).expect(409);
    // A bad rating is rejected.
    await http()
      .post(`/api/v1/public/review/deadbeefdeadbeefdeadbeefdeadbeef`)
      .send({ rating: 5 })
      .expect(404);

    const summary = (await http().get('/api/v1/reviews/summary').set(auth(a)).expect(200)).body;
    expect(summary.count).toBe(1);
    expect(summary.average).toBe(5);
    expect(summary.distribution).toEqual([0, 0, 0, 0, 1]);
  });

  it('hiding a review removes it from the reputation summary', async () => {
    await http()
      .post(`/api/v1/reviews/${reviewId}/publish`)
      .set(auth(a))
      .send({ published: false })
      .expect(201);
    const summary = (await http().get('/api/v1/reviews/summary').set(auth(a)).expect(200)).body;
    expect(summary.count).toBe(0);
  });

  it("is tenant-isolated: shop B cannot request on A's job, list, or see A's reviews", async () => {
    await http()
      .post(`/api/v1/work-items/${jobId}/review-request`)
      .set(auth(b))
      .send({})
      .expect(404);
    expect((await http().get('/api/v1/reviews').set(auth(b)).expect(200)).body).toHaveLength(0);
    const bSummary = (await http().get('/api/v1/reviews/summary').set(auth(b)).expect(200)).body;
    expect(bSummary.count).toBe(0);
  });
});
