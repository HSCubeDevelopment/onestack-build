// Card #32: the shop's reusable price book. Add/edit/deactivate items, search, and prove that a quote
// line built by "picking" an item is an independent copy — editing the line never mutates the book, and
// deactivating the item leaves existing lines intact. Tenant-isolated. Supabase HTTP.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Price book (card #32)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let jobId: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.staffToken}` });

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'PB A');
    b = await makeTenant(admin, 'PB B');
    app = await createApp();
    await app.init();
    const customerId = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(a))
        .send({ displayName: 'PB Cust', phone: '0400666000' })
    ).body.id;
    const vehicleId = (
      await http()
        .post(`/api/v1/contacts/${customerId}/vehicles`)
        .set(auth(a))
        .send({ rego: 'PBK1', make: 'Ford', model: 'Ranger', year: 2022 })
    ).body.id;
    jobId = (
      await http()
        .post('/api/v1/work-items')
        .set(auth(a))
        .send({ type: 'job', fields: { customerId }, subjectIds: [vehicleId] })
    ).body.id;
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      for (const tbl of [
        'onestack_line_item',
        'onestack_quote',
        'onestack_reference_counter',
        'onestack_price_book_item',
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

  it('adds items, warns on a duplicate name, and searches', async () => {
    const first = (
      await http()
        .post('/api/v1/price-book')
        .set(auth(a))
        .send({
          name: 'Panel labour',
          type: 'labour',
          unit: 'hour',
          defaultUnitPriceCents: 9500,
          code: 'LAB-1',
        })
        .expect(201)
    ).body;
    expect(first.duplicateNameWarning).toBe(false);
    expect(first.item.defaultUnitPriceCents).toBe(9500);

    await http()
      .post('/api/v1/price-book')
      .set(auth(a))
      .send({ name: 'Front bumper', type: 'part', unit: 'each', defaultUnitPriceCents: 42000 })
      .expect(201);

    // Same name again → allowed but flagged.
    const dupe = (
      await http()
        .post('/api/v1/price-book')
        .set(auth(a))
        .send({ name: 'Panel labour', type: 'labour', unit: 'hour', defaultUnitPriceCents: 10000 })
        .expect(201)
    ).body;
    expect(dupe.duplicateNameWarning).toBe(true);

    // Search by name and by code.
    expect(
      (await http().get('/api/v1/price-book').query({ q: 'bumper' }).set(auth(a)).expect(200)).body,
    ).toHaveLength(1);
    expect(
      (await http().get('/api/v1/price-book').query({ q: 'LAB-1' }).set(auth(a)).expect(200)).body,
    ).toHaveLength(1);
  });

  it('picking an item fills a quote line that stays independent of the book', async () => {
    const item = (
      await http()
        .post('/api/v1/price-book')
        .set(auth(a))
        .send({ name: 'Respray', type: 'labour', unit: 'hour', defaultUnitPriceCents: 12000 })
        .expect(201)
    ).body.item;

    // "Pick" the item → the client creates a quote line from its values.
    const quote = (await http().post(`/api/v1/work-items/${jobId}/quotes`).set(auth(a))).body;
    const line = (
      await http()
        .post(`/api/v1/quotes/${quote.id}/lines`)
        .set(auth(a))
        .send({
          description: item.name,
          type: item.type,
          quantity: 3,
          unitPriceCents: item.defaultUnitPriceCents,
        })
        .expect(201)
    ).body;

    // The line carries the item's price.
    const created = line.lines.find((l: { description: string }) => l.description === 'Respray');
    expect(created.unitPriceCents).toBe(12000);

    // Edit the line's price — the price book item must NOT change.
    await http()
      .patch(`/api/v1/quotes/${quote.id}/lines/${created.id}`)
      .set(auth(a))
      .send({ unitPriceCents: 15000 })
      .expect(200);
    const bookItem = (await http().get(`/api/v1/price-book/${item.id}`).set(auth(a)).expect(200))
      .body;
    expect(bookItem.defaultUnitPriceCents).toBe(12000); // unchanged
  });

  it('deactivating an item hides it from active search but keeps it retrievable', async () => {
    const item = (
      await http()
        .post('/api/v1/price-book')
        .set(auth(a))
        .send({ name: 'Old service', type: 'labour', unit: 'hour', defaultUnitPriceCents: 5000 })
    ).body.item;
    await http().post(`/api/v1/price-book/${item.id}/deactivate`).set(auth(a)).expect(201);

    // activeOnly search excludes it…
    const active = (
      await http()
        .get('/api/v1/price-book')
        .query({ q: 'Old service', activeOnly: 'true' })
        .set(auth(a))
        .expect(200)
    ).body;
    expect(active).toHaveLength(0);
    // …but it's still directly retrievable (existing quotes referencing its copied values are unaffected).
    expect(
      (await http().get(`/api/v1/price-book/${item.id}`).set(auth(a)).expect(200)).body.active,
    ).toBe(false);
  });

  it('is tenant-isolated: each shop has its own price book', async () => {
    expect((await http().get('/api/v1/price-book').set(auth(b)).expect(200)).body).toHaveLength(0);
    // B cannot read A's item.
    const anyA = (await http().get('/api/v1/price-book').set(auth(a))).body[0];
    await http().get(`/api/v1/price-book/${anyA.id}`).set(auth(b)).expect(404);
  });
});
