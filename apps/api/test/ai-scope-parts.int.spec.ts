// Phase 2 flagship, slice B — parts list from an AI scope → priced quote. Derive an editable parts list
// from a job's damage scope (stub analyzer, no external API), price it from the price book, and build a
// Draft quote through the shared Quote engine (GST correct). Nothing is ordered. Tenant-isolated.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe.skipIf(!hasDb)('AI parts list → priced quote — slice B (Phase 2)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let jobId: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  const makeJob = async (t: TestTenant): Promise<string> => {
    const customerId = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(t))
        .send({ displayName: 'Parts Cust', phone: '0400888999' })
    ).body.id;
    const vehicleId = (
      await http()
        .post(`/api/v1/contacts/${customerId}/vehicles`)
        .set(auth(t))
        .send({ rego: 'PART1', make: 'Kia', model: 'Cerato', year: 2021 })
    ).body.id;
    return (
      await http()
        .post('/api/v1/work-items')
        .set(auth(t))
        .send({ type: 'job', fields: { customerId }, subjectIds: [vehicleId] })
    ).body.id;
  };

  beforeAll(async () => {
    delete process.env.ANTHROPIC_API_KEY; // force the deterministic stub
    admin = adminPrisma();
    a = await makeTenant(admin, 'Parts A');
    b = await makeTenant(admin, 'Parts B');
    app = await createApp();
    await app.init();

    jobId = await makeJob(a);
    // 4 photos → stub scope has 4 items, of which two are "replace" (Front bumper, Front left headlight).
    for (let i = 0; i < 4; i++) {
      await http()
        .post(`/api/v1/work-items/${jobId}/attachments`)
        .set(auth(a))
        .send({ fileName: `p${i}.png`, contentType: 'image/png', dataBase64: PNG_BASE64 })
        .expect(201);
    }
    await http().post(`/api/v1/work-items/${jobId}/ai-scope`).set(auth(a)).expect(201);
    // Price book has a matching part for "Front bumper" but not the headlight.
    await http()
      .post('/api/v1/price-book')
      .set(auth(a))
      .send({ name: 'Front bumper', type: 'part', unit: 'each', defaultUnitPriceCents: 42000 })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      for (const tbl of [
        'onestack_scope_part',
        'onestack_damage_scope',
        'onestack_line_item',
        'onestack_quote',
        'onestack_reference_counter',
        'onestack_price_book_item',
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

  it('derives a parts list from the scope: replace panels only, priced from the book or left at 0', async () => {
    const parts = (
      await http().post(`/api/v1/work-items/${jobId}/parts-list`).set(auth(a)).expect(201)
    ).body;

    expect(parts).toHaveLength(2); // two "replace" panels; repair/paint are excluded
    const bumper = parts.find((p: { description: string }) =>
      p.description.startsWith('Front bumper'),
    );
    const headlight = parts.find((p: { description: string }) =>
      p.description.startsWith('Front left headlight'),
    );
    expect(bumper.unitPriceCents).toBe(42000); // matched the price book
    expect(bumper.priceBookItemId).toBeTruthy();
    expect(headlight.unitPriceCents).toBe(0); // no match → estimator prices it
    expect(headlight.priceBookItemId).toBeNull();
    expect(parts.every((p: { source: string }) => p.source === 'ai')).toBe(true);
  });

  it('refuses to build a quote while any part is unpriced', async () => {
    await http().post(`/api/v1/work-items/${jobId}/parts-list/quote`).set(auth(a)).expect(400);
  });

  it('lets the estimator price the unpriced part, then builds a GST-correct Draft quote', async () => {
    const parts = (
      await http().get(`/api/v1/work-items/${jobId}/parts-list`).set(auth(a)).expect(200)
    ).body;
    const headlight = parts.find((p: { unitPriceCents: number }) => p.unitPriceCents === 0);

    await http()
      .patch(`/api/v1/parts/${headlight.id}`)
      .set(auth(a))
      .send({ unitPriceCents: 68000 })
      .expect(200);

    const quote = (
      await http().post(`/api/v1/work-items/${jobId}/parts-list/quote`).set(auth(a)).expect(201)
    ).body;

    expect(quote.status).toBe('Draft'); // nothing sent
    expect(quote.lines).toHaveLength(2);
    // Parts surface as 'product' in the shared line-item vocabulary (the money engine's type).
    expect(quote.lines.every((l: { type: string }) => l.type === 'product')).toBe(true);
    // 42000 + 68000 = 110000 net; GST 10% = 11000; total 121000.
    expect(quote.subtotalCents).toBe(110000);
    expect(quote.gstCents).toBe(11000);
    expect(quote.totalCents).toBe(121000);
  });

  it('supports manual add + edit + remove on the parts list', async () => {
    const added = (
      await http()
        .post(`/api/v1/work-items/${jobId}/parts`)
        .set(auth(a))
        .send({ description: 'Tow-bar mount', unitPriceCents: 15000 })
        .expect(201)
    ).body;
    expect(added.source).toBe('manual');

    const edited = (
      await http().patch(`/api/v1/parts/${added.id}`).set(auth(a)).send({ quantity: 2 }).expect(200)
    ).body;
    expect(edited.quantity).toBe(2);

    await http().delete(`/api/v1/parts/${added.id}`).set(auth(a)).expect(204);
  });

  it('requires a scope before a parts list can be generated', async () => {
    const bare = await makeJob(a);
    await http().post(`/api/v1/work-items/${bare}/parts-list`).set(auth(a)).expect(400);
  });

  it("is tenant-isolated: shop B cannot read, build, or edit shop A's parts", async () => {
    const parts = (
      await http().get(`/api/v1/work-items/${jobId}/parts-list`).set(auth(a)).expect(200)
    ).body;

    // B sees A's job as not-found on the job-scoped routes.
    await http().post(`/api/v1/work-items/${jobId}/parts-list`).set(auth(b)).expect(404);
    await http().get(`/api/v1/work-items/${jobId}/parts-list`).set(auth(b)).expect(404);
    await http().post(`/api/v1/work-items/${jobId}/parts-list/quote`).set(auth(b)).expect(404);

    // B cannot edit or delete A's part by id.
    await http()
      .patch(`/api/v1/parts/${parts[0].id}`)
      .set(auth(b))
      .send({ unitPriceCents: 1 })
      .expect(404);
    await http().delete(`/api/v1/parts/${parts[0].id}`).set(auth(b)).expect(404);
  });
});
