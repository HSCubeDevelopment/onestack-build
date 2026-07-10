// Phase 4 — Point of sale (card #221). Walk-in checkout: open → add items → complete with a tender. Tenant-isolated.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Point of sale (Phase 4)', () => {
  let app: INestApplication; let admin: PrismaClient; let a: TestTenant; let b: TestTenant; let saleId: string;
  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  beforeAll(async () => {
    admin = adminPrisma(); a = await makeTenant(admin, 'POS A'); b = await makeTenant(admin, 'POS B');
    app = await createApp(); await app.init();
  });
  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) for (const tbl of ['onestack_sale_line','onestack_sale'])
      await admin.$executeRawUnsafe(`DELETE FROM "${tbl}" WHERE "tenantId" = $1::uuid`, t);
    await dropTenant(admin, a.tenantId); await dropTenant(admin, b.tenantId); await admin.$disconnect();
  });

  it('rings up a walk-in sale with GST and completes it', async () => {
    saleId = (await http().post('/api/v1/sales').set(auth(a)).send({}).expect(201)).body.id;
    await http().post(`/api/v1/sales/${saleId}/lines`).set(auth(a)).send({ description: 'Air freshener', quantity: 3, unitPriceCents: 500 }).expect(201);
    const s = (await http().post(`/api/v1/sales/${saleId}/lines`).set(auth(a)).send({ description: 'Wash', quantity: 1, unitPriceCents: 4000 }).expect(201)).body;
    expect(s.subtotalCents).toBe(5500);
    expect(s.totalCents).toBe(Math.round(5500 * 1.1));
    const done = (await http().post(`/api/v1/sales/${saleId}/complete`).set(auth(a)).send({ tenderType: 'card' }).expect(201)).body;
    expect(done.status).toBe('completed');
    expect(done.tenderType).toBe('card');
    await http().post(`/api/v1/sales/${saleId}/complete`).set(auth(a)).send({ tenderType: 'cash' }).expect(400);
  });

  it("is tenant-isolated: shop B can't see or complete A's sale", async () => {
    expect((await http().get('/api/v1/sales').set(auth(b)).expect(200)).body).toHaveLength(0);
    await http().get(`/api/v1/sales/${saleId}`).set(auth(b)).expect(404);
  });
});
