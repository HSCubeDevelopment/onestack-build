// Card #6.9 persistence: add/edit/remove/reorder + totals, tenant-isolated. Against Supabase.
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LineItemInput } from '../src/line-items/line-item';
import { LineItemParent, LineItemService } from '../src/line-items/line-item.service';
import { TenantService } from '../src/tenancy/tenant.service';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

const line = (over: Partial<LineItemInput> = {}): LineItemInput => ({
  description: 'Panel repair',
  type: 'labour',
  quantity: 2,
  unitPriceCents: 5000,
  taxCode: 'GST',
  taxTreatment: 'exclusive',
  ...over,
});

describe.skipIf(!hasDb)('LineItemService (persisted)', () => {
  let admin: PrismaClient;
  let svc: LineItemService;
  let a: TestTenant;
  let b: TestTenant;
  const parent: LineItemParent = { parentType: 'quote', parentId: randomUUID() };

  beforeAll(async () => {
    admin = adminPrisma();
    svc = new LineItemService(new TenantService());
    a = await makeTenant(admin, 'LI A');
    b = await makeTenant(admin, 'LI B');
  });

  afterAll(async () => {
    for (const t of [a.tenantId, b.tenantId]) {
      await admin.$executeRawUnsafe(
        `DELETE FROM "onestack_line_item" WHERE "tenantId" = $1::uuid`,
        t,
      );
    }
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  it('adds lines (money computed), edits, removes, reorders, and totals reconcile', async () => {
    const l1 = await svc.add(a.tenantId, parent, line()); // 2 × 5000 excl → net 10000, gst 1000, total 11000
    expect(l1).toMatchObject({
      netCents: 10000,
      gstCents: 1000,
      lineTotalCents: 11000,
      sortOrder: 0,
    });
    const l2 = await svc.add(
      a.tenantId,
      parent,
      line({ taxCode: 'GST_FREE', unitPriceCents: 250, quantity: 4 }),
    );
    expect(l2).toMatchObject({ gstCents: 0, lineTotalCents: 1000, sortOrder: 1 });

    // edit recomputes money
    const edited = await svc.edit(a.tenantId, l1.id, { quantity: 1 });
    expect(edited).toMatchObject({ netCents: 5000, gstCents: 500, lineTotalCents: 5500 });

    // reorder
    await svc.reorder(a.tenantId, parent, [l2.id, l1.id]);
    const listed = await svc.list(a.tenantId, parent);
    expect(listed.map((l) => l.id)).toEqual([l2.id, l1.id]);

    // totals reconcile (sum(net)+sum(gst)===sum(total))
    const t = await svc.totals(a.tenantId, parent);
    expect(t.netCents + t.gstCents).toBe(t.totalCents);

    // remove
    await svc.remove(a.tenantId, l2.id);
    expect(await svc.list(a.tenantId, parent)).toHaveLength(1);
  });

  it('isolates line items between tenants', async () => {
    await svc.add(a.tenantId, parent, line({ description: 'A-only line' }));
    const seenByB = await svc.list(b.tenantId, parent);
    expect(seenByB).toHaveLength(0);
  });
});
