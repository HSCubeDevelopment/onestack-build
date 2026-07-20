// Card 62.1 — parts procurement. The card's thesis is that parts margin is invisible and that is where
// the money is made, so the assertions worth caring about are: margin is right, an unpriced part says
// "unknown" rather than 100%, and a part that has physically landed cannot be quietly un-landed.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Parts procurement (card 62.1)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let jobId: string;

  const http = () => request(app.getHttpServer());
  const owner = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  const addPart = async (description: string, quantity: number, sellCents: number) =>
    (
      await http()
        .post(`/api/v1/work-items/${jobId}/parts`)
        .set(owner(a))
        .send({ description, quantity, unitPriceCents: sellCents })
        .expect(201)
    ).body;

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Parts A');
    b = await makeTenant(admin, 'Parts B');
    app = await createApp();
    await app.init();

    const customerId = (
      await http()
        .post('/api/v1/contacts')
        .set(owner(a))
        .send({ displayName: 'Parts Cust', phone: '0400555111' })
    ).body.id;
    const vehicleId = (
      await http()
        .post(`/api/v1/contacts/${customerId}/vehicles`)
        .set(owner(a))
        .send({ rego: 'PRT001', make: 'Ford', model: 'Ranger', year: 2021 })
    ).body.id;
    jobId = (
      await http()
        .post('/api/v1/work-items')
        .set(owner(a))
        .send({ type: 'job', fields: { customerId }, subjectIds: [vehicleId] })
    ).body.id;
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      for (const tbl of [
        'onestack_scope_part',
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

  it('starts a new part as needed, unpriced, with unknown margin', async () => {
    const part = await addPart('Front bumper bar', 1, 18500);
    expect(part.procurementStatus).toBe('needed');
    expect(part.buyPriceCents).toBeNull();
    // Not 100%. An unpriced part reporting full margin is the most flattering possible lie.
    expect(part.margin.unknown).toBe(true);
    expect(part.margin.marginPercent).toBeNull();
  });

  it('records supplier, buy price and grade, and computes margin', async () => {
    const part = await addPart('Left headlight', 1, 42000);

    const updated = (
      await http()
        .patch(`/api/v1/parts/${part.id}/procurement`)
        .set(owner(a))
        .send({
          buyPriceCents: 27300,
          grade: 'aftermarket',
          supplierPartNumber: 'HL-4471-AM',
          procurementStatus: 'ordered',
          expectedAt: '2026-07-24T00:00:00.000Z',
        })
        .expect(200)
    ).body;

    expect(updated.buyPriceCents).toBe(27300);
    expect(updated.grade).toBe('aftermarket');
    expect(updated.procurementStatus).toBe('ordered');
    expect(updated.margin.marginCents).toBe(14700);
    expect(updated.margin.marginPercent).toBe(35);
    expect(updated.margin.unknown).toBe(false);
  });

  it('rejects an invalid grade rather than storing free text', async () => {
    const part = await addPart('Grille', 1, 9000);
    await http()
      .patch(`/api/v1/parts/${part.id}/procurement`)
      .set(owner(a))
      .send({ grade: 'genuine-ish' })
      .expect(400);
  });

  it('refuses to skip straight from needed to received', async () => {
    const part = await addPart('Bonnet', 1, 55000);
    await http()
      .patch(`/api/v1/parts/${part.id}/procurement`)
      .set(owner(a))
      .send({ procurementStatus: 'received' })
      .expect(400);
  });

  it('leaves a partial delivery back-ordered, then closes it on the rest', async () => {
    // 2 of 3 guards arriving is the normal case on a workshop floor, not an edge case.
    const part = await addPart('Guard', 3, 22000);
    await http()
      .patch(`/api/v1/parts/${part.id}/procurement`)
      .set(owner(a))
      .send({ procurementStatus: 'ordered' })
      .expect(200);

    const partial = (
      await http()
        .post(`/api/v1/parts/${part.id}/receive`)
        .set(owner(a))
        .send({ quantity: 2 })
        .expect(201)
    ).body;
    expect(partial.procurementStatus).toBe('back_order');
    expect(partial.receivedQuantity).toBe(2);
    expect(partial.receivedAt).toBeNull();

    // Quantities ACCUMULATE — the second docket says "1", not "3".
    const complete = (
      await http()
        .post(`/api/v1/parts/${part.id}/receive`)
        .set(owner(a))
        .send({ quantity: 1 })
        .expect(201)
    ).body;
    expect(complete.procurementStatus).toBe('received');
    expect(complete.receivedQuantity).toBe(3);
    expect(complete.receivedAt).not.toBeNull();
  });

  it('will not un-receive a part that has physically landed', async () => {
    const part = await addPart('Tail light', 1, 30000);
    await http()
      .patch(`/api/v1/parts/${part.id}/procurement`)
      .set(owner(a))
      .send({ procurementStatus: 'ordered' })
      .expect(200);
    await http()
      .post(`/api/v1/parts/${part.id}/receive`)
      .set(owner(a))
      .send({ quantity: 1 })
      .expect(201);

    // Flipping back to ordered would make the goods-received record meaningless.
    await http()
      .patch(`/api/v1/parts/${part.id}/procurement`)
      .set(owner(a))
      .send({ procurementStatus: 'ordered' })
      .expect(400);
  });

  it('rejects a zero or negative receipt', async () => {
    const part = await addPart('Clip set', 10, 500);
    await http()
      .post(`/api/v1/parts/${part.id}/receive`)
      .set(owner(a))
      .send({ quantity: 0 })
      .expect(400);
  });

  it('summarises job margin, excluding unpriced lines and counting them', async () => {
    const summary = (
      await http().get(`/api/v1/work-items/${jobId}/parts-list/margin`).set(owner(a)).expect(200)
    ).body;

    // Several parts above were never given a buy price; the percentage must describe only the ones
    // that were, with unpricedCount saying how much of the picture is missing.
    expect(summary.lineCount).toBeGreaterThan(summary.unpricedCount);
    expect(summary.unpricedCount).toBeGreaterThan(0);
    expect(summary.marginCents).toBe(summary.sellTotalCents - summary.buyTotalCents);
  });

  it('is tenant-isolated: shop B cannot touch shop A’s buy prices', async () => {
    const part = await addPart('Isolated part', 1, 10000);

    await http()
      .patch(`/api/v1/parts/${part.id}/procurement`)
      .set(owner(b))
      .send({ buyPriceCents: 1 })
      .expect(404);
    await http()
      .post(`/api/v1/parts/${part.id}/receive`)
      .set(owner(b))
      .send({ quantity: 1 })
      .expect(404);
    await http().get(`/api/v1/work-items/${jobId}/parts-list/margin`).set(owner(b)).expect(404);
  });

  it('keeps buy prices away from STAFF — cost base is not floor information', async () => {
    await http()
      .get(`/api/v1/work-items/${jobId}/parts-list/margin`)
      .set({ Authorization: `Bearer ${a.staffToken}` })
      .expect(403);
  });
});
