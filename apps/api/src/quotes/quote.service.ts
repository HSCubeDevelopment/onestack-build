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

export type QuoteStatus = 'Draft' | 'Sent' | 'Accepted' | 'Declined';

export interface QuoteView {
  id: string;
  reference: string;
  status: string;
  workItemId: string;
  revision: number;
  supersedesId: string | null;
  supersededById: string | null; // set if a later revision revises this quote
  subtotalCents: number;
  gstCents: number;
  totalCents: number;
  lines: QuoteLineView[];
}

// Forward-only status moves. A quote is revised (not re-opened) once it has left Draft.
const NEXT_STATUS: Record<string, QuoteStatus[]> = {
  Draft: ['Sent'],
  Sent: ['Accepted', 'Declined'],
  Accepted: [],
  Declined: [],
};

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

  /** Move the quote along Draft → Sent → Accepted|Declined (card #30/#33). Forward-only. */
  async setStatus(tenantId: string, quoteId: string, status: QuoteStatus): Promise<QuoteView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const quote = await tx.quote.findFirst({ where: { id: quoteId } });
      if (!quote) throw new NotFoundException('Quote not found');
      if (!NEXT_STATUS[quote.status]?.includes(status))
        throw new ConflictException(`Cannot move a ${quote.status} quote to ${status}`);
      if (status === 'Sent') {
        const count = await tx.lineItem.count({
          where: { parentType: 'quote', parentId: quoteId },
        });
        if (count === 0) throw new BadRequestException('Cannot send an empty quote');
      }
      await tx.quote.update({ where: { id: quoteId }, data: { status } });
      return this.viewFrom(tx, { ...quote, status });
    });
  }

  /**
   * Create a revision / supplementary quote (card #33). A NEW Draft quote (v2, v3…) linked to the one it
   * supersedes, seeded with a COPY of the source's lines so the estimator adds the extra scope on top.
   * The original is retained untouched — full audit trail. Only quotes that have left Draft are revised
   * (a Draft should just be edited). Totals recompute from the new quote's own lines.
   */
  async revise(tenantId: string, sourceId: string): Promise<QuoteView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const source = await tx.quote.findFirst({ where: { id: sourceId } });
      if (!source) throw new NotFoundException('Quote not found');
      if (source.status === 'Draft')
        throw new ConflictException(
          'A Draft quote can be edited directly — revise a sent/accepted one',
        );

      const revision = source.revision + 1;
      const baseRef = source.reference.replace(/-r\d+$/, ''); // strip any prior -rN suffix
      const revised = await tx.quote.create({
        data: {
          tenantId,
          workItemId: source.workItemId,
          reference: `${baseRef}-r${revision}`,
          status: 'Draft',
          revision,
          supersedesId: source.id,
        },
      });

      // Seed the revision with a copy of the source's lines (money already computed — copy verbatim).
      const src = await tx.lineItem.findMany({
        where: { parentType: 'quote', parentId: source.id },
        orderBy: { sortOrder: 'asc' },
      });
      for (const l of src) {
        await tx.lineItem.create({
          data: {
            tenantId,
            parentType: 'quote',
            parentId: revised.id,
            description: l.description,
            type: l.type,
            quantity: l.quantity,
            unitPriceCents: l.unitPriceCents,
            taxCode: l.taxCode,
            taxTreatment: l.taxTreatment,
            netCents: l.netCents,
            gstCents: l.gstCents,
            lineTotalCents: l.lineTotalCents,
            sortOrder: l.sortOrder,
          },
        });
      }
      return this.viewFrom(tx, revised);
    });
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
    quote: {
      id: string;
      reference: string;
      status: string;
      workItemId: string;
      revision: number;
      supersedesId: string | null;
    },
  ): Promise<QuoteView> {
    const [lines, superseder] = await Promise.all([
      tx.lineItem.findMany({
        where: { parentType: 'quote', parentId: quote.id },
        orderBy: { sortOrder: 'asc' },
      }),
      tx.quote.findFirst({ where: { supersedesId: quote.id }, select: { id: true } }),
    ]);
    return {
      id: quote.id,
      reference: quote.reference,
      status: quote.status,
      workItemId: quote.workItemId,
      revision: quote.revision,
      supersedesId: quote.supersedesId,
      supersededById: superseder?.id ?? null,
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
