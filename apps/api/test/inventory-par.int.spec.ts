// Phase 4 — Automotive extensions (card #260): par-level auto-reorder suggestions + stocktake. Tenant-isolated.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Automotive extensions — reorder + stocktake (Phase 4)', () => {
  let app: INestApplication; let admin: PrismaClient; let a: TestTenant; let b: TestTenant; let itemId: string;
  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  beforeAll(async () => {
    admin = adminPrisma(); a = await makeTenant(admin, 'Par A'); b = await makeTenant(admin, 'Par B');
    app = await createApp(); await app.init();
  });
  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) for (const tbl of ['onestack_stock_movement', 'onestack_inventory_item'])
      await admin.$executeRawUnsafe(`DELETE FROM "${tbl}" WHERE "tenantId" = $1::uuid`, t);
    await dropTenant(admin, a.tenantId); await dropTenant(admin, b.tenantId); await admin.$disconnect();
  });

  it('suggests reorder up to par for low items', async () => {
    itemId = (await http().post('/api/v1/inventory').set(auth(a)).send({ name: 'Clip', quantityOnHand: 2, reorderLevel: 5, parLevel: 20 }).expect(201)).body.id;
    await http().post('/api/v1/inventory').set(auth(a)).send({ name: 'Bracket', quantityOnHand: 40, reorderLevel: 5, parLevel: 20 }).expect(201);
    const reorder = (await http().get('/api/v1/inventory/reorder').set(auth(a)).expect(200)).body;
    expect(reorder).toHaveLength(1);
    expect(reorder[0].name).toBe('Clip');
    expect(reorder[0].suggestedReorderQty).toBe(18);
  });

  it('stocktake sets the counted on-hand', async () => {
    const after = (await http().post(`/api/v1/inventory/${itemId}/stocktake`).set(auth(a)).send({ countedQuantity: 25 }).expect(201)).body;
    expect(after.quantityOnHand).toBe(25);
    expect(after.lowStock).toBe(false);
    // Now above par → no longer in reorder list.
    expect((await http().get('/api/v1/inventory/reorder').set(auth(a)).expect(200)).body).toHaveLength(0);
    await http().post(`/api/v1/inventory/${itemId}/stocktake`).set(auth(a)).send({ countedQuantity: -1 }).expect(400);
  });

  it("is tenant-isolated: shop B can't stocktake A's item", async () => {
    await http().post(`/api/v1/inventory/${itemId}/stocktake`).set(auth(b)).send({ countedQuantity: 1 }).expect(404);
  });
});
