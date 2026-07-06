import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantService } from '../tenancy/tenant.service';

export type PriceBookItemType = 'labour' | 'part';
export type PriceBookUnit = 'hour' | 'each';

export interface PriceBookItemView {
  id: string;
  name: string;
  description: string | null;
  type: PriceBookItemType;
  unit: PriceBookUnit;
  defaultUnitPriceCents: number;
  code: string | null;
  active: boolean;
}

export interface CreatePriceBookItemInput {
  name: string;
  description?: string;
  type: PriceBookItemType;
  unit: PriceBookUnit;
  defaultUnitPriceCents: number;
  code?: string;
}

export interface UpdatePriceBookItemInput {
  name?: string;
  description?: string | null;
  type?: PriceBookItemType;
  unit?: PriceBookUnit;
  defaultUnitPriceCents?: number;
  code?: string | null;
  active?: boolean;
}

/**
 * Price book (card #32): the shop's reusable catalogue of labour & parts. Picking an item copies its
 * values onto a quote/invoice line elsewhere — this service never touches lines, so an edited line can
 * never mutate the book (and vice-versa). Prices are integer cents. Tenant-scoped via the wrapper.
 */
@Injectable()
export class PriceBookService {
  constructor(private readonly tenants: TenantService) {}

  async create(
    tenantId: string,
    input: CreatePriceBookItemInput,
  ): Promise<{ item: PriceBookItemView; duplicateNameWarning: boolean }> {
    if (!input.name?.trim()) throw new BadRequestException('name is required');
    if (!Number.isInteger(input.defaultUnitPriceCents) || input.defaultUnitPriceCents < 0)
      throw new BadRequestException('defaultUnitPriceCents must be a non-negative integer');

    return this.tenants.runInTenant(tenantId, async (tx) => {
      // Same name is ALLOWED but flagged (card edge case).
      const dupe = await tx.priceBookItem.findFirst({
        where: { name: input.name.trim(), active: true },
      });
      const row = await tx.priceBookItem.create({
        data: {
          tenantId,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          type: input.type,
          unit: input.unit,
          defaultUnitPriceCents: input.defaultUnitPriceCents,
          code: input.code?.trim() || null,
        },
      });
      return { item: toView(row), duplicateNameWarning: dupe !== null };
    });
  }

  /** List / search. `q` matches name or code (case-insensitive). `activeOnly` hides deactivated items. */
  async list(tenantId: string, q?: string, activeOnly = false): Promise<PriceBookItemView[]> {
    const term = q?.trim();
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const rows = await tx.priceBookItem.findMany({
        where: {
          ...(activeOnly ? { active: true } : {}),
          ...(term
            ? {
                OR: [
                  { name: { contains: term, mode: 'insensitive' } },
                  { code: { contains: term, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        orderBy: { name: 'asc' },
      });
      return rows.map(toView);
    });
  }

  async get(tenantId: string, id: string): Promise<PriceBookItemView> {
    const row = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.priceBookItem.findFirst({ where: { id } }),
    );
    if (!row) throw new NotFoundException('Price book item not found');
    return toView(row);
  }

  async update(
    tenantId: string,
    id: string,
    patch: UpdatePriceBookItemInput,
  ): Promise<PriceBookItemView> {
    if (
      patch.defaultUnitPriceCents !== undefined &&
      (!Number.isInteger(patch.defaultUnitPriceCents) || patch.defaultUnitPriceCents < 0)
    )
      throw new BadRequestException('defaultUnitPriceCents must be a non-negative integer');
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const row = await tx.priceBookItem.findFirst({ where: { id } });
      if (!row) throw new NotFoundException('Price book item not found');
      await tx.priceBookItem.update({
        where: { id },
        data: {
          ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
          ...(patch.description !== undefined
            ? { description: patch.description?.trim() || null }
            : {}),
          ...(patch.type !== undefined ? { type: patch.type } : {}),
          ...(patch.unit !== undefined ? { unit: patch.unit } : {}),
          ...(patch.defaultUnitPriceCents !== undefined
            ? { defaultUnitPriceCents: patch.defaultUnitPriceCents }
            : {}),
          ...(patch.code !== undefined ? { code: patch.code?.trim() || null } : {}),
          ...(patch.active !== undefined ? { active: patch.active } : {}),
        },
      });
      const updated = await tx.priceBookItem.findFirst({ where: { id } });
      return toView(updated!);
    });
  }

  /** Deactivate — hides from search; existing quote/invoice lines already copied its values, so unaffected. */
  async deactivate(tenantId: string, id: string): Promise<PriceBookItemView> {
    return this.update(tenantId, id, { active: false });
  }
}

function toView(i: {
  id: string;
  name: string;
  description: string | null;
  type: string;
  unit: string;
  defaultUnitPriceCents: number;
  code: string | null;
  active: boolean;
}): PriceBookItemView {
  return {
    id: i.id,
    name: i.name,
    description: i.description,
    type: i.type as PriceBookItemType,
    unit: i.unit as PriceBookUnit,
    defaultUnitPriceCents: i.defaultUnitPriceCents,
    code: i.code,
    active: i.active,
  };
}
