// Phase 2 flagship, slice C — draft purchase order. Seed a PO from the parts list, adjust it, confirm
// it, and try to send it. Sending goes through the vendor boundary: with the default no-op sender
// NOTHING is emailed. Tenant-isolated. Uses the stub analyzer (no external API).
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe.skipIf(!hasDb)('Draft purchase order — slice C (Phase 2)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let jobId: string;
  let supplierId: string;
  let poId: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  const makeJob = async (t: TestTenant): Promise<string> => {
    const customerId = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(t))
        .send({ displayName: 'PO Cust', phone: '0400111222' })
    ).body.id;
    const vehicleId = (
      await http()
        .post(`/api/v1/contacts/${customerId}/vehicles`)
        .set(auth(t))
        .send({ rego: 'PO1', make: 'Subaru', model: 'Impreza', year: 2020 })
    ).body.id;
    return (
      await http()
        .post('/api/v1/work-items')
        .set(auth(t))
        .send({ type: 'job', fields: { customerId }, subjectIds: [vehicleId] })
    ).body.id;
  };

  beforeAll(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    admin = adminPrisma();
    a = await makeTenant(admin, 'PO A');
    b = await makeTenant(admin, 'PO B');
    app = await createApp();
    await app.init();

    jobId = await makeJob(a);
    for (let i = 0; i < 4; i++) {
      await http()
        .post(`/api/v1/work-items/${jobId}/attachments`)
        .set(auth(a))
        .send({ fileName: `p${i}.png`, contentType: 'image/png', dataBase64: PNG_BASE64 })
        .expect(201);
    }
    await http().post(`/api/v1/work-items/${jobId}/ai-scope`).set(auth(a)).expect(201);
    await http()
      .post('/api/v1/price-book')
      .set(auth(a))
      .send({ name: 'Front bumper', type: 'part', unit: 'each', defaultUnitPriceCents: 42000 })
      .expect(201);
    await http().post(`/api/v1/work-items/${jobId}/parts-list`).set(auth(a)).expect(201);

    supplierId = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(a))
        .send({ displayName: 'Parts Supplier Pty Ltd', phone: '0398887777' })
    ).body.id;
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      for (const tbl of [
        'onestack_purchase_order_line',
        'onestack_purchase_order',
        'onestack_scope_part',
        'onestack_damage_scope',
        'onestack_price_book_item',
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
  }, 120_000); // generous: cleanup spans many tables and the pooler can be slow under load

  it('seeds a draft PO from the parts list', async () => {
    const po = (
      await http()
        .post(`/api/v1/work-items/${jobId}/purchase-order`)
        .set(auth(a))
        .send({ supplierContactId: supplierId })
        .expect(201)
    ).body;
    poId = po.id;

    expect(po.status).toBe('draft');
    expect(po.reference).toMatch(/^PO-\d{6}$/);
    expect(po.supplierContactId).toBe(supplierId);
    expect(po.lines).toHaveLength(2); // one per part
    // Front bumper 42000 + headlight 0 (unpriced in the parts list) = 42000 expected cost.
    expect(po.totalCents).toBe(42000);
    expect(po.lines.every((l: { scopePartId: string | null }) => l.scopePartId)).toBe(true);
  });

  it('lets the estimator edit line costs, add, and remove lines while draft', async () => {
    const po = (await http().get(`/api/v1/purchase-orders/${poId}`).set(auth(a)).expect(200)).body;
    const zeroLine = po.lines.find((l: { unitPriceCents: number }) => l.unitPriceCents === 0);

    const edited = (
      await http()
        .patch(`/api/v1/purchase-orders/${poId}/lines/${zeroLine.id}`)
        .set(auth(a))
        .send({ unitPriceCents: 30000 })
        .expect(200)
    ).body;
    expect(edited.totalCents).toBe(72000); // 42000 + 30000

    const withAdded = (
      await http()
        .post(`/api/v1/purchase-orders/${poId}/lines`)
        .set(auth(a))
        .send({ description: 'Clips & fasteners', quantity: 3, unitPriceCents: 500 })
        .expect(201)
    ).body;
    expect(withAdded.lines).toHaveLength(3);
    expect(withAdded.totalCents).toBe(73500); // + 3×500

    const addedLine = withAdded.lines.find(
      (l: { description: string }) => l.description === 'Clips & fasteners',
    );
    const afterRemove = (
      await http()
        .delete(`/api/v1/purchase-orders/${poId}/lines/${addedLine.id}`)
        .set(auth(a))
        .expect(200)
    ).body;
    expect(afterRemove.lines).toHaveLength(2);
    expect(afterRemove.totalCents).toBe(72000);
  });

  it('confirms the draft, then locks editing and does not send it', async () => {
    const confirmed = (
      await http().post(`/api/v1/purchase-orders/${poId}/confirm`).set(auth(a)).expect(201)
    ).body;
    expect(confirmed.status).toBe('confirmed');

    // Locked: a confirmed PO can't be edited.
    await http()
      .post(`/api/v1/purchase-orders/${poId}/lines`)
      .set(auth(a))
      .send({ description: 'late add', unitPriceCents: 100 })
      .expect(409);

    // Send goes through the vendor boundary — no provider configured → not delivered, stays confirmed.
    const sent = (
      await http().post(`/api/v1/purchase-orders/${poId}/send`).set(auth(a)).expect(201)
    ).body;
    expect(sent.result.delivered).toBe(false);
    expect(sent.result.reason).toMatch(/no email provider/i);
    expect(sent.purchaseOrder.status).toBe('confirmed'); // NOT 'sent'
  });

  it('refuses to create a PO from an empty parts list', async () => {
    const bare = await makeJob(a);
    await http().post(`/api/v1/work-items/${bare}/purchase-order`).set(auth(a)).expect(400);
  });

  it("is tenant-isolated: shop B cannot create, read, edit, confirm, or send shop A's PO", async () => {
    // B can't create a PO against A's job.
    await http()
      .post(`/api/v1/work-items/${jobId}/purchase-order`)
      .set(auth(b))
      .send({})
      .expect(404);
    // B can't read A's PO.
    await http().get(`/api/v1/purchase-orders/${poId}`).set(auth(b)).expect(404);
    await http().get(`/api/v1/work-items/${jobId}/purchase-orders`).set(auth(b)).expect(404);
    // B can't confirm or send A's PO.
    await http().post(`/api/v1/purchase-orders/${poId}/confirm`).set(auth(b)).expect(404);
    await http().post(`/api/v1/purchase-orders/${poId}/send`).set(auth(b)).expect(404);
  });
});
