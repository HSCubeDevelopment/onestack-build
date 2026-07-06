import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantService } from '../tenancy/tenant.service';
import { computeLine, LineItemInput, LineType, TaxCode, TaxTreatment, Totals } from './line-item';

export interface LineItemParent {
  parentType: 'quote' | 'invoice';
  parentId: string;
}

export interface LineItemView {
  id: string;
  description: string;
  type: string;
  quantity: number;
  unitPriceCents: number;
  taxCode: string;
  taxTreatment: string;
  netCents: number;
  gstCents: number;
  lineTotalCents: number;
  sortOrder: number;
}

interface Row extends LineItemView {
  parentType: string;
  parentId: string;
}

/**
 * Persisted Line Item (card #6.9). The SAME service backs Quote and Invoice (parentType). Money is
 * always recomputed from the pure `computeLine` (docs/money-rules.md #29) on write — the stored
 * net/gst/total are never trusted as input. Tenant-scoped: every op runs through runInTenant → RLS.
 */
@Injectable()
export class LineItemService {
  constructor(private readonly tenants: TenantService) {}

  async add(tenantId: string, parent: LineItemParent, input: LineItemInput): Promise<LineItemView> {
    const c = computeLine(input);
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const max = await tx.lineItem.aggregate({
        where: { parentType: parent.parentType, parentId: parent.parentId },
        _max: { sortOrder: true },
      });
      const row = await tx.lineItem.create({
        data: {
          tenantId,
          parentType: parent.parentType,
          parentId: parent.parentId,
          description: input.description,
          type: input.type,
          quantity: input.quantity,
          unitPriceCents: input.unitPriceCents,
          taxCode: input.taxCode,
          taxTreatment: input.taxTreatment,
          netCents: c.netCents,
          gstCents: c.gstCents,
          lineTotalCents: c.totalCents,
          sortOrder: (max._max.sortOrder ?? -1) + 1,
        },
      });
      return toView(row);
    });
  }

  async edit(tenantId: string, id: string, patch: Partial<LineItemInput>): Promise<LineItemView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const cur = await tx.lineItem.findFirst({ where: { id } });
      if (!cur) throw new NotFoundException('Line item not found');
      const merged: LineItemInput = {
        description: patch.description ?? cur.description,
        type: (patch.type ?? cur.type) as LineType,
        quantity: patch.quantity ?? cur.quantity,
        unitPriceCents: patch.unitPriceCents ?? cur.unitPriceCents,
        taxCode: (patch.taxCode ?? cur.taxCode) as TaxCode,
        taxTreatment: (patch.taxTreatment ?? cur.taxTreatment) as TaxTreatment,
      };
      const c = computeLine(merged);
      const row = await tx.lineItem.update({
        where: { id },
        data: {
          ...merged,
          netCents: c.netCents,
          gstCents: c.gstCents,
          lineTotalCents: c.totalCents,
        },
      });
      return toView(row);
    });
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.tenants.runInTenant(tenantId, (tx) => tx.lineItem.deleteMany({ where: { id } }));
  }

  async reorder(tenantId: string, parent: LineItemParent, orderedIds: string[]): Promise<void> {
    await this.tenants.runInTenant(tenantId, async (tx) => {
      const items = await tx.lineItem.findMany({
        where: { parentType: parent.parentType, parentId: parent.parentId },
      });
      const ids = new Set(items.map((i) => i.id));
      if (orderedIds.length !== items.length || !orderedIds.every((id) => ids.has(id))) {
        throw new BadRequestException('reorder ids must be a permutation of the parent line ids');
      }
      for (let i = 0; i < orderedIds.length; i++) {
        await tx.lineItem.update({ where: { id: orderedIds[i] }, data: { sortOrder: i } });
      }
    });
  }

  async list(tenantId: string, parent: LineItemParent): Promise<LineItemView[]> {
    const rows = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.lineItem.findMany({
        where: { parentType: parent.parentType, parentId: parent.parentId },
        orderBy: { sortOrder: 'asc' },
      }),
    );
    return rows.map(toView);
  }

  async totals(tenantId: string, parent: LineItemParent): Promise<Totals> {
    const rows = await this.list(tenantId, parent);
    return rows.reduce<Totals>(
      (acc, r) => ({
        netCents: acc.netCents + r.netCents,
        gstCents: acc.gstCents + r.gstCents,
        totalCents: acc.totalCents + r.lineTotalCents,
      }),
      { netCents: 0, gstCents: 0, totalCents: 0 },
    );
  }
}

function toView(r: Row): LineItemView {
  return {
    id: r.id,
    description: r.description,
    type: r.type,
    quantity: r.quantity,
    unitPriceCents: r.unitPriceCents,
    taxCode: r.taxCode,
    taxTreatment: r.taxTreatment,
    netCents: r.netCents,
    gstCents: r.gstCents,
    lineTotalCents: r.lineTotalCents,
    sortOrder: r.sortOrder,
  };
}
