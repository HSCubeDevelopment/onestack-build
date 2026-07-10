import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { PosService } from './pos.service';

function make() {
  const sales: any[] = []; const lines: any[] = [];
  const tx = {
    sale: {
      create: async ({ data }: any) => { const r = { id: `s${sales.length + 1}`, status: 'open', tenderType: null, subtotalCents: 0, gstCents: 0, totalCents: 0, completedAt: null, contactId: null, createdAt: new Date(), ...data }; sales.push(r); return r; },
      findFirst: async ({ where, include }: any) => { const r = sales.find((s) => s.id === where.id); if (!r) return null; return include?.lines ? { ...r, lines: lines.filter((l) => l.saleId === r.id) } : r; },
      findMany: async () => sales.map((s) => ({ ...s, lines: lines.filter((l) => l.saleId === s.id) })),
      update: async ({ where, data }: any) => { const r = sales.find((s) => s.id === where.id); Object.assign(r, data); return r; },
    },
    saleLine: {
      create: async ({ data }: any) => { const r = { id: `l${lines.length + 1}`, createdAt: new Date(), ...data }; lines.push(r); return r; },
      findMany: async ({ where }: any) => lines.filter((l) => l.saleId === where.saleId),
      deleteMany: async ({ where }: any) => { const i = lines.findIndex((l) => l.id === where.id); if (i >= 0) lines.splice(i, 1); return { count: 1 }; },
    },
  };
  const tenants = { runInTenant: (_t: string, fn: (tx: unknown) => unknown) => fn(tx) };
  return { svc: new PosService(tenants as never) };
}

describe('PosService', () => {
  it('opens a sale, adds lines with GST, completes with a tender', async () => {
    const { svc } = make();
    const sale = await svc.open('t1', undefined, 'u1');
    expect(sale.status).toBe('open');
    let s = await svc.addLine('t1', sale.id, { description: 'Wash', quantity: 2, unitPriceCents: 5000 });
    expect(s.subtotalCents).toBe(10000);
    expect(s.gstCents).toBe(1000);   // 10%
    expect(s.totalCents).toBe(11000);
    s = await svc.complete('t1', sale.id, 'cash');
    expect(s.status).toBe('completed');
    expect(s.tenderType).toBe('cash');
  });

  it('will not complete an empty sale or edit a completed one', async () => {
    const { svc } = make();
    const sale = await svc.open('t1', undefined, 'u1');
    await expect(svc.complete('t1', sale.id, 'cash')).rejects.toBeInstanceOf(BadRequestException);
    await svc.addLine('t1', sale.id, { description: 'Wash', quantity: 1, unitPriceCents: 5000 });
    await svc.complete('t1', sale.id, 'card');
    await expect(svc.addLine('t1', sale.id, { description: 'x', quantity: 1, unitPriceCents: 1 })).rejects.toBeInstanceOf(BadRequestException);
  });
});
