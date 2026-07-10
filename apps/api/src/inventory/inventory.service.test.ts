import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { InventoryService } from './inventory.service';

function make() {
  const items: any[] = [];
  const moves: any[] = [];
  const tx = {
    inventoryItem: {
      create: async ({ data }: any) => { const r = { id: `i${items.length + 1}`, sku: null, unit: null, unitCostCents: null, active: true, ...data }; items.push(r); return r; },
      findMany: async ({ where }: any) => items.filter((i) => i.active === where.active),
      findFirst: async ({ where }: any) => items.find((i) => i.id === where.id) ?? null,
      update: async ({ where, data }: any) => { const r = items.find((i) => i.id === where.id); Object.assign(r, data); return r; },
    },
    stockMovement: { create: async ({ data }: any) => { moves.push(data); return data; } },
  };
  const tenants = { runInTenant: (_t: string, fn: (tx: unknown) => unknown) => fn(tx) };
  return { svc: new InventoryService(tenants as never), moves };
}

describe('InventoryService', () => {
  it('creates an item and flags low stock at/under reorder level', async () => {
    const { svc } = make();
    await svc.createItem('t1', { name: 'Bolt', quantityOnHand: 2, reorderLevel: 5 });
    const list = await svc.list('t1');
    expect(list[0]?.lowStock).toBe(true);
    const low = await svc.list('t1', true);
    expect(low).toHaveLength(1);
  });

  it('adjusts stock via a movement and updates on-hand', async () => {
    const { svc, moves } = make();
    const it = await svc.createItem('t1', { name: 'Bolt', quantityOnHand: 10, reorderLevel: 5 });
    const rec = await svc.adjust('t1', it.id, { delta: -3, reason: 'use' }, 'u1');
    expect(rec.quantityOnHand).toBe(7);
    expect(moves[0]).toMatchObject({ delta: -3, reason: 'use' });
    const back = await svc.adjust('t1', it.id, { delta: 5, reason: 'receive' }, 'u1');
    expect(back.quantityOnHand).toBe(12);
    expect(back.lowStock).toBe(false);
  });

  it('rejects a blank name and a zero delta', async () => {
    const { svc } = make();
    await expect(svc.createItem('t1', { name: '' })).rejects.toBeInstanceOf(BadRequestException);
    const it = await svc.createItem('t1', { name: 'Bolt' });
    await expect(svc.adjust('t1', it.id, { delta: 0 }, 'u1')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('InventoryService — auto-reorder & stocktake (#260)', () => {
  it('suggests reordering up to par for low items', async () => {
    const { svc } = make();
    await svc.createItem('t1', { name: 'Bolt', quantityOnHand: 2, reorderLevel: 5, parLevel: 20 });
    await svc.createItem('t1', { name: 'Nut', quantityOnHand: 50, reorderLevel: 5, parLevel: 20 });
    const suggestions = await svc.reorderSuggestions('t1');
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.name).toBe('Bolt');
    expect(suggestions[0]?.suggestedReorderQty).toBe(18); // 20 - 2
  });

  it('stocktake sets the counted on-hand and records the correction', async () => {
    const { svc, moves } = make();
    const it = await svc.createItem('t1', { name: 'Bolt', quantityOnHand: 10, reorderLevel: 5 });
    const after = await svc.stocktake('t1', it.id, 7, 'u1');
    expect(after.quantityOnHand).toBe(7);
    expect(moves.at(-1)).toMatchObject({ delta: -3, reason: 'adjust', note: 'Stocktake' });
  });
});
