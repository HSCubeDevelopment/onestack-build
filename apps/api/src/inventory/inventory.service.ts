import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantService } from '../tenancy/tenant.service';

export interface InventoryItemView {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  quantityOnHand: number;
  reorderLevel: number;
  unitCostCents: number | null;
  active: boolean;
  /** Computed: on-hand is at or below the reorder level. */
  lowStock: boolean;
}

export interface CreateItemInput {
  name: string;
  sku?: string;
  unit?: string;
  quantityOnHand?: number;
  reorderLevel?: number;
  unitCostCents?: number;
}

export interface UpdateItemInput {
  name?: string;
  sku?: string | null;
  unit?: string | null;
  reorderLevel?: number;
  unitCostCents?: number | null;
  active?: boolean;
}

export type MovementReason = 'receive' | 'use' | 'adjust';

/**
 * Inventory & stock (Phase 4, card #220). GENERIC core (Sales & Money). Tracks on-hand stock, usage (via
 * append-only movements) and reordering (low-stock signal at/under the reorder level). A movement adjusts
 * the item's quantity atomically. Tenant-scoped throughout.
 */
@Injectable()
export class InventoryService {
  constructor(private readonly tenants: TenantService) {}

  async createItem(tenantId: string, input: CreateItemInput): Promise<InventoryItemView> {
    const name = input.name?.trim();
    if (!name) throw new BadRequestException('name is required');
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const row = await tx.inventoryItem.create({
        data: {
          tenantId,
          name,
          sku: input.sku?.trim() || null,
          unit: input.unit?.trim() || null,
          quantityOnHand: int(input.quantityOnHand, 0),
          reorderLevel: int(input.reorderLevel, 0),
          unitCostCents: input.unitCostCents ?? null,
        },
      });
      return toView(row);
    });
  }

  async list(tenantId: string, lowOnly = false): Promise<InventoryItemView[]> {
    const rows = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.inventoryItem.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    );
    const views = rows.map(toView);
    return lowOnly ? views.filter((v) => v.lowStock) : views;
  }

  async update(tenantId: string, id: string, patch: UpdateItemInput): Promise<InventoryItemView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const existing = await tx.inventoryItem.findFirst({ where: { id } });
      if (!existing) throw new NotFoundException('Item not found');
      const data: Record<string, unknown> = {};
      if (patch.name !== undefined) data.name = patch.name.trim();
      if (patch.sku !== undefined) data.sku = patch.sku?.trim() || null;
      if (patch.unit !== undefined) data.unit = patch.unit?.trim() || null;
      if (patch.reorderLevel !== undefined) data.reorderLevel = int(patch.reorderLevel, 0);
      if (patch.unitCostCents !== undefined) data.unitCostCents = patch.unitCostCents;
      if (patch.active !== undefined) data.active = patch.active;
      const row = await tx.inventoryItem.update({ where: { id }, data });
      return toView(row);
    });
  }

  /** Record a stock movement (receive/use/adjust) and update the on-hand quantity atomically. */
  async adjust(
    tenantId: string,
    id: string,
    input: { delta: number; reason?: MovementReason; note?: string },
    userId: string,
  ): Promise<InventoryItemView> {
    if (!Number.isInteger(input.delta) || input.delta === 0)
      throw new BadRequestException('delta must be a non-zero integer');
    const reason: MovementReason =
      input.reason === 'receive' || input.reason === 'use' ? input.reason : 'adjust';

    return this.tenants.runInTenant(tenantId, async (tx) => {
      const item = await tx.inventoryItem.findFirst({ where: { id } });
      if (!item) throw new NotFoundException('Item not found');
      await tx.stockMovement.create({
        data: { tenantId, itemId: id, delta: input.delta, reason, note: input.note?.trim() || null, createdByUserId: userId },
      });
      const row = await tx.inventoryItem.update({
        where: { id },
        data: { quantityOnHand: item.quantityOnHand + input.delta },
      });
      return toView(row);
    });
  }
}

function int(v: number | undefined, dflt: number): number {
  return Number.isInteger(v) ? (v as number) : dflt;
}

function toView(r: {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  quantityOnHand: number;
  reorderLevel: number;
  unitCostCents: number | null;
  active: boolean;
}): InventoryItemView {
  return {
    id: r.id,
    name: r.name,
    sku: r.sku,
    unit: r.unit,
    quantityOnHand: r.quantityOnHand,
    reorderLevel: r.reorderLevel,
    unitCostCents: r.unitCostCents,
    active: r.active,
    lowStock: r.quantityOnHand <= r.reorderLevel,
  };
}
