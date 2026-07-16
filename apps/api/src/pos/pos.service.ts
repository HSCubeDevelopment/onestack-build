import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TenantService } from '../tenancy/tenant.service';

const GST_RATE = 0.1; // AU GST, added to net line prices (project money convention).

export interface SaleLineView {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}
export interface SaleView {
  id: string;
  reference: string;
  contactId: string | null;
  status: 'open' | 'completed' | 'void';
  tenderType: string | null;
  subtotalCents: number;
  gstCents: number;
  totalCents: number;
  createdAt: string;
  completedAt: string | null;
  lines: SaleLineView[];
}

type Tender = 'cash' | 'card' | 'other';

/**
 * Point of sale (Phase 4, card #221). GENERIC core (Sales & Money). In-person checkout for walk-ins,
 * optionally tied to a customer. Line prices are net; GST is added at 10%. On completion it records HOW the
 * customer paid (a tender label — cash/card/other) but does NOT process a card payment — that's the
 * deferred payments phase. Tenant-scoped throughout.
 */
@Injectable()
export class PosService {
  constructor(private readonly tenants: TenantService) {}

  async open(tenantId: string, contactId: string | undefined, userId: string): Promise<SaleView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const sale = await tx.sale.create({
        data: {
          tenantId,
          contactId: contactId ?? null,
          reference: `SALE-${randomUUID().slice(0, 6).toUpperCase()}`,
          createdByUserId: userId,
        },
      });
      return this.view(tx, sale.id);
    });
  }

  async get(tenantId: string, id: string): Promise<SaleView> {
    return this.tenants.runInTenant(tenantId, (tx) => this.view(tx, id));
  }

  async list(tenantId: string): Promise<SaleView[]> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const sales = await tx.sale.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { lines: true },
      });
      return sales.map(toView);
    });
  }

  async addLine(
    tenantId: string,
    id: string,
    input: { description: string; quantity: number; unitPriceCents: number },
  ): Promise<SaleView> {
    const description = input.description?.trim();
    if (!description) throw new BadRequestException('description is required');
    if (!Number.isInteger(input.quantity) || input.quantity < 1)
      throw new BadRequestException('quantity must be ≥ 1');
    if (!Number.isInteger(input.unitPriceCents) || input.unitPriceCents < 0)
      throw new BadRequestException('unitPriceCents must be ≥ 0');
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const sale = await tx.sale.findFirst({ where: { id } });
      if (!sale) throw new NotFoundException('Sale not found');
      if (sale.status !== 'open') throw new BadRequestException('Only an open sale can be edited');
      await tx.saleLine.create({
        data: {
          tenantId,
          saleId: id,
          description,
          quantity: input.quantity,
          unitPriceCents: input.unitPriceCents,
          lineTotalCents: input.quantity * input.unitPriceCents,
        },
      });
      await this.recompute(tx, id);
      return this.view(tx, id);
    });
  }

  async removeLine(tenantId: string, id: string, lineId: string): Promise<SaleView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const sale = await tx.sale.findFirst({ where: { id } });
      if (!sale) throw new NotFoundException('Sale not found');
      if (sale.status !== 'open') throw new BadRequestException('Only an open sale can be edited');
      await tx.saleLine.deleteMany({ where: { id: lineId, saleId: id } });
      await this.recompute(tx, id);
      return this.view(tx, id);
    });
  }

  async complete(tenantId: string, id: string, tenderType: Tender): Promise<SaleView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const sale = await tx.sale.findFirst({ where: { id }, include: { lines: true } });
      if (!sale) throw new NotFoundException('Sale not found');
      if (sale.status !== 'open')
        throw new BadRequestException(`This sale is already ${sale.status}`);
      if (sale.lines.length === 0)
        throw new BadRequestException('Add at least one item before completing');
      await tx.sale.update({
        where: { id },
        data: { status: 'completed', tenderType, completedAt: new Date() },
      });
      return this.view(tx, id);
    });
  }

  async void(tenantId: string, id: string): Promise<SaleView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const sale = await tx.sale.findFirst({ where: { id } });
      if (!sale) throw new NotFoundException('Sale not found');
      await tx.sale.update({ where: { id }, data: { status: 'void' } });
      return this.view(tx, id);
    });
  }

  private async recompute(tx: any, id: string): Promise<void> {
    const lines = await tx.saleLine.findMany({ where: { saleId: id } });
    const subtotalCents = lines.reduce(
      (s: number, l: { lineTotalCents: number }) => s + l.lineTotalCents,
      0,
    );
    const gstCents = Math.round(subtotalCents * GST_RATE);
    await tx.sale.update({
      where: { id },
      data: { subtotalCents, gstCents, totalCents: subtotalCents + gstCents },
    });
  }

  private async view(tx: any, id: string): Promise<SaleView> {
    const sale = await tx.sale.findFirst({
      where: { id },
      include: { lines: { orderBy: { createdAt: 'asc' } } },
    });
    if (!sale) throw new NotFoundException('Sale not found');
    return toView(sale);
  }
}

function toView(s: {
  id: string;
  reference: string;
  contactId: string | null;
  status: string;
  tenderType: string | null;
  subtotalCents: number;
  gstCents: number;
  totalCents: number;
  createdAt: Date;
  completedAt: Date | null;
  lines: {
    id: string;
    description: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
  }[];
}): SaleView {
  return {
    id: s.id,
    reference: s.reference,
    contactId: s.contactId,
    status: s.status as SaleView['status'],
    tenderType: s.tenderType,
    subtotalCents: s.subtotalCents,
    gstCents: s.gstCents,
    totalCents: s.totalCents,
    createdAt: s.createdAt.toISOString(),
    completedAt: s.completedAt ? s.completedAt.toISOString() : null,
    lines: s.lines.map((l) => ({
      id: l.id,
      description: l.description,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      lineTotalCents: l.lineTotalCents,
    })),
  };
}
