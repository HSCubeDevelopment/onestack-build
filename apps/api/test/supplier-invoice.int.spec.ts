// Phase 2 — Supplier invoice capture. Capture a supplier's invoice against a job as an editable draft,
// adjust it, confirm it, and try to export it to accounting. OCR scan and accounting export are vendor
// boundaries (no-op). A supplier invoice never touches the customer money engine. Tenant-isolated.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

const SOME_UUID = '11111111-1111-4111-8111-111111111111';

describe.skipIf(!hasDb)('Supplier invoice capture — slice (Phase 2)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let jobId: string;
  let supplierId: string;
  let invId: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  const makeJob = async (t: TestTenant): Promise<string> => {
    const customerId = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(t))
        .send({ displayName: 'SI Cust', phone: '0400777888' })
    ).body.id;
    const vehicleId = (
      await http()
        .post(`/api/v1/contacts/${customerId}/vehicles`)
        .set(auth(t))
        .send({ rego: 'SI1', make: 'VW', model: 'Golf', year: 2019 })
    ).body.id;
    return (
      await http()
        .post('/api/v1/work-items')
        .set(auth(t))
        .send({ type: 'job', fields: { customerId }, subjectIds: [vehicleId] })
    ).body.id;
  };

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'SI A');
    b = await makeTenant(admin, 'SI B');
    app = await createApp();
    await app.init();
    jobId = await makeJob(a);
    supplierId = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(a))
        .send({ displayName: 'Paint Supplies Co', phone: '0390001111' })
    ).body.id;
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      for (const tbl of [
        'onestack_supplier_invoice_line',
        'onestack_supplier_invoice',
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

  it('captures a supplier invoice as an editable draft', async () => {
    const inv = (
      await http()
        .post(`/api/v1/work-items/${jobId}/supplier-invoices`)
        .set(auth(a))
        .send({
          supplierContactId: supplierId,
          invoiceNumber: 'INV-88001',
          invoiceDate: '2026-07-05',
          lines: [
            { description: '2K Clear coat', quantity: 2, unitPriceCents: 4500 },
            { description: 'Primer', quantity: 1, unitPriceCents: 3000 },
          ],
        })
        .expect(201)
    ).body;
    invId = inv.id;

    expect(inv.status).toBe('draft');
    expect(inv.source).toBe('manual');
    expect(inv.invoiceNumber).toBe('INV-88001');
    expect(inv.supplierContactId).toBe(supplierId);
    expect(inv.lines).toHaveLength(2);
    expect(inv.totalCents).toBe(12000); // 2×4500 + 3000
  });

  it('rejects an invoice with no lines or no number', async () => {
    await http()
      .post(`/api/v1/work-items/${jobId}/supplier-invoices`)
      .set(auth(a))
      .send({ invoiceNumber: 'X', lines: [] })
      .expect(400);
    await http()
      .post(`/api/v1/work-items/${jobId}/supplier-invoices`)
      .set(auth(a))
      .send({ invoiceNumber: '', lines: [{ description: 'y' }] })
      .expect(400);
  });

  it('edits a line and the header while draft', async () => {
    const inv = (await http().get(`/api/v1/supplier-invoices/${invId}`).set(auth(a)).expect(200))
      .body;
    const primer = inv.lines.find((l: { description: string }) => l.description === 'Primer');

    const edited = (
      await http()
        .patch(`/api/v1/supplier-invoices/${invId}/lines/${primer.id}`)
        .set(auth(a))
        .send({ unitPriceCents: 3500 })
        .expect(200)
    ).body;
    expect(edited.totalCents).toBe(12500); // 9000 + 3500

    const rehead = (
      await http()
        .patch(`/api/v1/supplier-invoices/${invId}`)
        .set(auth(a))
        .send({ invoiceNumber: 'INV-88001-R' })
        .expect(200)
    ).body;
    expect(rehead.invoiceNumber).toBe('INV-88001-R');
  });

  it('OCR scan reports no provider (enter manually)', async () => {
    const res = (
      await http()
        .post(`/api/v1/work-items/${jobId}/supplier-invoices/scan`)
        .set(auth(a))
        .send({ attachmentId: SOME_UUID })
        .expect(201)
    ).body;
    expect(res.extracted).toBe(false);
    expect(res.suggestion).toBeNull();
    expect(res.reason).toMatch(/no ocr provider/i);
  });

  it('confirms the draft, locks editing, and exports report no accounting provider', async () => {
    const confirmed = (
      await http().post(`/api/v1/supplier-invoices/${invId}/confirm`).set(auth(a)).expect(201)
    ).body;
    expect(confirmed.status).toBe('confirmed');

    // Locked once confirmed.
    await http()
      .patch(`/api/v1/supplier-invoices/${invId}`)
      .set(auth(a))
      .send({ notes: 'late' })
      .expect(409);

    const exported = (
      await http()
        .post(`/api/v1/supplier-invoices/${invId}/export-to-accounting`)
        .set(auth(a))
        .expect(201)
    ).body;
    expect(exported.result.exported).toBe(false);
    expect(exported.result.reason).toMatch(/no accounting provider/i);
    expect(exported.invoice.status).toBe('confirmed'); // NOT 'exported'
  });

  it('refuses to export a draft (must confirm first)', async () => {
    const draft = (
      await http()
        .post(`/api/v1/work-items/${jobId}/supplier-invoices`)
        .set(auth(a))
        .send({ invoiceNumber: 'INV-2', lines: [{ description: 'Thinner', unitPriceCents: 900 }] })
        .expect(201)
    ).body;
    await http()
      .post(`/api/v1/supplier-invoices/${draft.id}/export-to-accounting`)
      .set(auth(a))
      .expect(409);
  });

  it("is tenant-isolated: shop B cannot capture, read, confirm, export, or scan shop A's invoices", async () => {
    await http()
      .post(`/api/v1/work-items/${jobId}/supplier-invoices`)
      .set(auth(b))
      .send({ invoiceNumber: 'H', lines: [{ description: 'x' }] })
      .expect(404);
    await http().get(`/api/v1/work-items/${jobId}/supplier-invoices`).set(auth(b)).expect(404);
    await http().get(`/api/v1/supplier-invoices/${invId}`).set(auth(b)).expect(404);
    await http().post(`/api/v1/supplier-invoices/${invId}/confirm`).set(auth(b)).expect(404);
    await http()
      .post(`/api/v1/supplier-invoices/${invId}/export-to-accounting`)
      .set(auth(b))
      .expect(404);
    await http()
      .post(`/api/v1/work-items/${jobId}/supplier-invoices/scan`)
      .set(auth(b))
      .send({ attachmentId: SOME_UUID })
      .expect(404);
  });
});
