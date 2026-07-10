// Phase 4 — Inventory & stock (card #220). Create items, adjust stock (receive/use), see low-stock. Tenant-isolated.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Inventory & stock (Phase 4)', () => {
  let app: INestApplication; let admin: PrismaClient; let a: TestTenant; let b: TestTenant; let itemId: string;
  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  beforeAll(async () => {
    admin = adminPrisma(); a = await makeTenant(admin, 'Inv A'); b = await makeTenant(admin, 'Inv B');
    app = await createApp(); await app.init();
  });
  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) for (const tbl of ['onestack_stock_movement', 'onestack_inventory_item'])
      await admin.$executeRawUnsafe(`DELETE FROM "${tbl}" WHERE "tenantId" = $1::uuid`, t);
    await dropTenant(admin, a.tenantId); await dropTenant(admin, b.tenantId); await admin.$disconnect();
  });

  it('creates an item and lists it', async () => {
    itemId = (await http().post('/api/v1/inventory').set(auth(a)).send({ name: 'Brake pad', quantityOnHand: 3, reorderLevel: 5, unit: 'each' }).expect(201)).body.id;
    const list = (await http().get('/api/v1/inventory').set(auth(a)).expect(200)).body;
    expect(list).toHaveLength(1);
    expect(list[0].lowStock).toBe(true);
  });

  it('receives + uses stock, updating on-hand', async () => {
    const recv = (await http().post(`/api/v1/inventory/${itemId}/movement`).set(auth(a)).send({ delta: 10, reason: 'receive' }).expect(201)).body;
    expect(recv.quantityOnHand).toBe(13);
    const used = (await http().post(`/api/v1/inventory/${itemId}/movement`).set(auth(a)).send({ delta: -2, reason: 'use' }).expect(201)).body;
    expect(used.quantityOnHand).toBe(11);
    expect(used.lowStock).toBe(false);
    await http().post(`/api/v1/inventory/${itemId}/movement`).set(auth(a)).send({ delta: 0 }).expect(400);
  });

  it('low-stock filter returns only items at/under reorder', async () => {
    await http().post('/api/v1/inventory').set(auth(a)).send({ name: 'Wiper', quantityOnHand: 0, reorderLevel: 2 }).expect(201);
    const low = (await http().get('/api/v1/inventory?low=true').set(auth(a)).expect(200)).body;
    expect(low.every((i: { lowStock: boolean }) => i.lowStock)).toBe(true);
    expect(low.some((i: { name: string }) => i.name === 'Wiper')).toBe(true);
  });

  it("is tenant-isolated: shop B sees none of A's inventory", async () => {
    expect((await http().get('/api/v1/inventory').set(auth(b)).expect(200)).body).toHaveLength(0);
    await http().post(`/api/v1/inventory/${itemId}/movement`).set(auth(b)).send({ delta: 1 }).expect(404);
  });
});
