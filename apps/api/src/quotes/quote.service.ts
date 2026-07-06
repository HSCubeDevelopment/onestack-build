import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LineItemInput } from '../line-items/line-item';
import { LineItemService } from '../line-items/line-item.service';
import { TenantClient, TenantService } from '../tenancy/tenant.service';

export type QuoteLineType = 'labour' | 'part';

export interface QuoteLineInput {
  description: string;
  type: QuoteLineType;
  quantity: number;
  unitPriceCents: number;
  taxCode?: 'GST' | 'GST_FREE';
}

export interface QuoteLineView {
  id: string;
  description: string;
  type: string;
  quantity: number;
  unitPriceCents: number;
  netCents: number;
  gstCents: number;
  lineTotalCents: number;
}

export interface QuoteView {
  id: string;
  reference: string;
  status: string;
  workItemId: string;
  subtotalCents: number;
  gstCents: number;
  totalCents: number;
  lines: QuoteLineView[];
}

/**
 * Quote on a job (card #30). Line items are the shared onestack_line_item (#6.9), so quote and invoice
 * share ONE money implementation (docs/money-rules.md #29). Totals are always derived from the stored
 * per-line cents — never a separate copy. Lines can only change while the quote is Draft.
 */
@Injectable()
export class QuoteService {
  constructor(
    private readonly tenants: TenantService,
    private readonly lineItems: LineItemService,
  ) {}

  async create(tenantId: string, jobId: string): Promise<QuoteView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const job = await tx.workItem.findFirst({ where: { id: jobId, deletedAt: null } });
      if (!job) throw new NotFoundException('Job not found');
      const counter = await tx.referenceCounter.upsert({
        where: { tenantId_scope: { tenantId, scope: 'quote' } },
        create: { tenantId, scope: 'quote', value: 1 },
        update: { value: { increment: 1 } },
      });
      const quote = await tx.quote.create({
        data: {
          tenantId,
          workItemId: jobId,
          reference: `Q-${String(counter.value).padStart(6, '0')}`,
          status: 'Draft',
        },
      });
      return this.viewFrom(tx, quote);
    });
  }

  async get(tenantId: string, id: string): Promise<QuoteView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const quote = await tx.quote.findFirst({ where: { id } });
      if (!quote) throw new NotFoundException('Quote not found');
      return this.viewFrom(tx, quote);
    });
  }

  async listForJob(tenantId: string, jobId: string): Promise<QuoteView[]> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const quotes = await tx.quote.findMany({
        where: { workItemId: jobId },
        orderBy: { createdAt: 'desc' },
      });
      return Promise.all(quotes.map((q) => this.viewFrom(tx, q)));
    });
  }

  async addLine(tenantId: string, quoteId: string, input: QuoteLineInput): Promise<QuoteView> {
    this.assertPositive(input.quantity, input.unitPriceCents);
    await this.assertDraft(tenantId, quoteId);
    await this.lineItems.add(
      tenantId,
      { parentType: 'quote', parentId: quoteId },
      toLineItem(input),
    );
    return this.get(tenantId, quoteId);
  }

  async editLine(
    tenantId: string,
    quoteId: string,
    lineId: string,
    patch: Partial<QuoteLineInput>,
  ): Promise<QuoteView> {
    if (patch.quantity !== undefined && patch.quantity < 1)
      throw new BadRequestException('quantity must be ≥ 1');
    if (patch.unitPriceCents !== undefined && patch.unitPriceCents < 1)
      throw new BadRequestException('unit price must be ≥ 1');
    await this.assertDraft(tenantId, quoteId);
    await this.lineItems.edit(tenantId, lineId, {
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.type !== undefined ? { type: patch.type === 'part' ? 'product' : 'labour' } : {}),
      ...(patch.quantity !== undefined ? { quantity: patch.quantity } : {}),
      ...(patch.unitPriceCents !== undefined ? { unitPriceCents: patch.unitPriceCents } : {}),
      ...(patch.taxCode !== undefined ? { taxCode: patch.taxCode } : {}),
    });
    return this.get(tenantId, quoteId);
  }

  async removeLine(tenantId: string, quoteId: string, lineId: string): Promise<QuoteView> {
    await this.assertDraft(tenantId, quoteId);
    await this.lineItems.remove(tenantId, lineId);
    return this.get(tenantId, quoteId);
  }

  private assertPositive(quantity: number, unitPriceCents: number): void {
    if (quantity < 1) throw new BadRequestException('quantity must be ≥ 1');
    if (unitPriceCents < 1) throw new BadRequestException('unit price must be ≥ 1');
  }

  private async assertDraft(tenantId: string, quoteId: string): Promise<void> {
    const quote = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.quote.findFirst({ where: { id: quoteId } }),
    );
    if (!quote) throw new NotFoundException('Quote not found');
    if (quote.status !== 'Draft') throw new ConflictException('Quote is not editable (not Draft)');
  }

  private async viewFrom(
    tx: TenantClient,
    quote: { id: string; reference: string; status: string; workItemId: string },
  ): Promise<QuoteView> {
    const lines = await tx.lineItem.findMany({
      where: { parentType: 'quote', parentId: quote.id },
      orderBy: { sortOrder: 'asc' },
    });
    return {
      id: quote.id,
      reference: quote.reference,
      status: quote.status,
      workItemId: quote.workItemId,
      subtotalCents: lines.reduce((s, l) => s + l.netCents, 0),
      gstCents: lines.reduce((s, l) => s + l.gstCents, 0),
      totalCents: lines.reduce((s, l) => s + l.lineTotalCents, 0),
      lines: lines.map((l) => ({
        id: l.id,
        description: l.description,
        type: l.type,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        netCents: l.netCents,
        gstCents: l.gstCents,
        lineTotalCents: l.lineTotalCents,
      })),
    };
  }
}

function toLineItem(input: QuoteLineInput): LineItemInput {
  return {
    description: input.description,
    type: input.type === 'part' ? 'product' : 'labour',
    quantity: input.quantity,
    unitPriceCents: input.unitPriceCents,
    taxCode: input.taxCode ?? 'GST',
    taxTreatment: 'exclusive', // quoted prices are ex-GST; GST added on top
  };
}
