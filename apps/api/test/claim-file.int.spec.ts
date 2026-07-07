// Phase 2 — Claim file. Group a claim's artefacts (claim paperwork, customer, vehicle, photos, quotes,
// invoices) against a job into one pack, export it as a download, and share it (vendor boundary: no-op).
// No insurer integration in the MVP. Tenant-isolated.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe.skipIf(!hasDb)('Claim file — claim pack per job (Phase 2)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let jobId: string;
  let insurerId: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Claim A');
    b = await makeTenant(admin, 'Claim B');
    app = await createApp();
    await app.init();

    insurerId = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(a))
        .send({ displayName: 'AAMI Insurance', phone: '0132244' })
    ).body.id;
    const customerId = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(a))
        .send({ displayName: 'Jane Motorist', phone: '0400123456', email: 'jane@example.com' })
    ).body.id;
    const vehicleId = (
      await http()
        .post(`/api/v1/contacts/${customerId}/vehicles`)
        .set(auth(a))
        .send({ rego: 'CLM1', make: 'Mazda', model: 'CX-5', year: 2021 })
    ).body.id;

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
              authorisedAmountCents: 12300,
              excessCents: 2000,
              billPayer: 'insurer',
            },
          },
        })
        .expect(201)
    ).body.id;

    await http()
      .post(`/api/v1/work-items/${jobId}/attachments`)
      .set(auth(a))
      .send({ fileName: 'damage.png', contentType: 'image/png', dataBase64: PNG_BASE64 })
      .expect(201);

    const quote = (await http().post(`/api/v1/work-items/${jobId}/quotes`).set(auth(a))).body;
    await http()
      .post(`/api/v1/quotes/${quote.id}/lines`)
      .set(auth(a))
      .send({ description: 'Labour', type: 'labour', quantity: 2, unitPriceCents: 5000 });
    await http().post(`/api/v1/quotes/${quote.id}/invoice`).set(auth(a)).expect(201);
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
        'onestack_work_item_attachment',
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

  it('assembles the claim pack: paperwork, customer, insurer, vehicle, photos, quotes, invoices', async () => {
    const pack = (
      await http().get(`/api/v1/work-items/${jobId}/claim-file`).set(auth(a)).expect(200)
    ).body;

    expect(pack.job.reference).toMatch(/^J-\d{6}$/);
    expect(pack.job.description).toBe('Rear-end repair');
    expect(pack.claim).toMatchObject({
      insurer: 'AAMI',
      claimNumber: 'CLM-2026-777',
      billPayer: 'insurer',
    });
    // The internal insurer contact id is not leaked in the claim block; the resolved insurer is separate.
    expect(pack.claim.insurerContactId).toBeUndefined();
    expect(pack.customer.displayName).toBe('Jane Motorist');
    expect(pack.insurer).toMatchObject({ id: insurerId, displayName: 'AAMI Insurance' });
    expect(pack.vehicles).toHaveLength(1);
    expect(pack.counts).toEqual({ photos: 1, quotes: 1, invoices: 1 });
    // Invoice from a 2×5000 labour quote → 10000 net + 10% GST = 11000 invoiced, unpaid.
    expect(pack.financials).toEqual({
      invoicedCents: 11000,
      paidCents: 0,
      outstandingCents: 11000,
    });
  });

  it('exports the pack as a downloadable, timestamped JSON attachment', async () => {
    const res = await http()
      .get(`/api/v1/work-items/${jobId}/claim-file/export`)
      .set(auth(a))
      .expect(200);

    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('claim-');
    expect(res.body.generatedAt).toBeTruthy();
    expect(res.body.claim.claimNumber).toBe('CLM-2026-777');
    expect(res.body.counts.invoices).toBe(1);
  });

  it('reports the pack was not shared (no provider configured — never auto-shares)', async () => {
    const result = (
      await http().post(`/api/v1/work-items/${jobId}/claim-file/share`).set(auth(a)).expect(201)
    ).body;
    expect(result.shared).toBe(false);
    expect(result.url).toBeNull();
    expect(result.reason).toMatch(/no sharing provider/i);
  });

  it("is tenant-isolated: shop B cannot view, export, or share shop A's claim file", async () => {
    await http().get(`/api/v1/work-items/${jobId}/claim-file`).set(auth(b)).expect(404);
    await http().get(`/api/v1/work-items/${jobId}/claim-file/export`).set(auth(b)).expect(404);
    await http().post(`/api/v1/work-items/${jobId}/claim-file/share`).set(auth(b)).expect(404);
  });
});
