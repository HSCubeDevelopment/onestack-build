import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PriceBookService } from '../price-book/price-book.service';
import { QuoteService, QuoteView } from '../quotes/quote.service';
import { TenantService } from '../tenancy/tenant.service';
import { partsFromScope, PriceBookPart } from './parts-from-scope';
import {
  PartGrade,
  PartMargin,
  PartsSummary,
  ProcurementStatus,
  canTransitionTo,
  partMargin,
  statusAfterReceipt,
  summariseParts,
} from './parts-procurement';

export interface ScopePartView {
  id: string;
  workItemId: string;
  damageScopeId: string | null;
  description: string;
  quantity: number;
  unitPriceCents: number;
  priceBookItemId: string | null;
  source: 'ai' | 'manual';
  sortOrder: number;

  // Card 62.1 — procurement.
  buyPriceCents: number | null;
  grade: PartGrade | null;
  procurementStatus: ProcurementStatus;
  supplierContactId: string | null;
  supplierPartNumber: string | null;
  expectedAt: Date | null;
  receivedAt: Date | null;
  receivedQuantity: number;
  /** Computed, never stored — storing it would let it drift from the prices it is derived from. */
  margin: PartMargin;
}

/** Procurement details. Every field optional — supplier now, price when the invoice lands. */
export interface SetProcurementInput {
  buyPriceCents?: number | null;
  grade?: PartGrade | null;
  procurementStatus?: ProcurementStatus;
  supplierContactId?: string | null;
  supplierPartNumber?: string | null;
  expectedAt?: Date | null;
}

export interface AddScopePartInput {
  description: string;
  quantity?: number;
  unitPriceCents?: number;
}

export interface EditScopePartInput {
  description?: string;
  quantity?: number;
  unitPriceCents?: number;
}

/**
 * Parts list from an AI scope (Phase 2 flagship, slice B). Turns a job's confirmed damage scope into an
 * editable parts list, then — once every part is priced — builds a real Draft quote through the shared
 * Quote engine. Two deliberately separate stages so a 0-priced draft can exist here (the money quote
 * forbids <$1 lines) and the estimator prices it before a quote is ever created. Nothing is ordered or
 * sent: `buildQuote` only produces a Draft quote a human then reviews.
 *
 * Cross-module work goes through public services (PriceBookService, QuoteService) — this service never
 * queries the price-book or line-item tables directly. Its own parts list is tenant-scoped via the wrapper.
 */
@Injectable()
export class ScopePartService {
  constructor(
    private readonly tenants: TenantService,
    private readonly priceBook: PriceBookService,
    private readonly quotes: QuoteService,
  ) {}

  /** Derive the parts list from the job's current damage scope, pricing each from the price book. */
  async generateFromScope(tenantId: string, jobId: string): Promise<ScopePartView[]> {
    const scope = await this.tenants.runInTenant(tenantId, async (tx) => {
      const job = await tx.workItem.findFirst({ where: { id: jobId, deletedAt: null } });
      if (!job) throw new NotFoundException('Job not found');
      return tx.damageScope.findFirst({
        where: { workItemId: jobId },
        orderBy: { createdAt: 'desc' },
      });
    });
    if (!scope) {
      throw new BadRequestException(
        'Generate a damage scope for this job before building a parts list',
      );
    }

    // Active price-book PARTS only — labour items never become parts.
    const priceBookParts: PriceBookPart[] = (await this.priceBook.list(tenantId, undefined, true))
      .filter((i) => i.type === 'part')
      .map((i) => ({ id: i.id, name: i.name, defaultUnitPriceCents: i.defaultUnitPriceCents }));

    const scopeItems = Array.isArray(scope.items)
      ? (scope.items as {
          panel: string;
          operation: 'replace' | 'repair' | 'paint';
          note?: string | null;
        }[])
      : [];
    const drafts = partsFromScope(scopeItems, priceBookParts);

    return this.tenants.runInTenant(tenantId, async (tx) => {
      // One current parts list per job — regenerating replaces it.
      await tx.scopePart.deleteMany({ where: { workItemId: jobId } });
      for (let idx = 0; idx < drafts.length; idx++) {
        const d = drafts[idx]!;
        await tx.scopePart.create({
          data: {
            tenantId,
            workItemId: jobId,
            damageScopeId: scope.id,
            description: d.description,
            quantity: d.quantity,
            unitPriceCents: d.unitPriceCents,
            priceBookItemId: d.priceBookItemId,
            source: 'ai',
            sortOrder: idx,
          },
        });
      }
      const rows = await tx.scopePart.findMany({
        where: { workItemId: jobId },
        orderBy: { sortOrder: 'asc' },
      });
      return rows.map(toView);
    });
  }

  async listForJob(tenantId: string, jobId: string): Promise<ScopePartView[]> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const job = await tx.workItem.findFirst({ where: { id: jobId, deletedAt: null } });
      if (!job) throw new NotFoundException('Job not found');
      const rows = await tx.scopePart.findMany({
        where: { workItemId: jobId },
        orderBy: { sortOrder: 'asc' },
      });
      return rows.map(toView);
    });
  }

  /** Add a part by hand (e.g. one the AI missed). */
  async addPart(tenantId: string, jobId: string, input: AddScopePartInput): Promise<ScopePartView> {
    const description = input.description?.trim();
    if (!description) throw new BadRequestException('description is required');
    const quantity = input.quantity ?? 1;
    const unitPriceCents = input.unitPriceCents ?? 0;
    assertPartAmounts(quantity, unitPriceCents);

    return this.tenants.runInTenant(tenantId, async (tx) => {
      const job = await tx.workItem.findFirst({ where: { id: jobId, deletedAt: null } });
      if (!job) throw new NotFoundException('Job not found');
      const last = await tx.scopePart.findFirst({
        where: { workItemId: jobId },
        orderBy: { sortOrder: 'desc' },
      });
      const row = await tx.scopePart.create({
        data: {
          tenantId,
          workItemId: jobId,
          description,
          quantity,
          unitPriceCents,
          source: 'manual',
          sortOrder: (last?.sortOrder ?? -1) + 1,
        },
      });
      return toView(row);
    });
  }

  async editPart(
    tenantId: string,
    partId: string,
    patch: EditScopePartInput,
  ): Promise<ScopePartView> {
    const description = patch.description !== undefined ? patch.description.trim() : undefined;
    if (description !== undefined && !description)
      throw new BadRequestException('description cannot be empty');
    if (patch.quantity !== undefined && (!Number.isInteger(patch.quantity) || patch.quantity < 1))
      throw new BadRequestException('quantity must be an integer ≥ 1');
    if (
      patch.unitPriceCents !== undefined &&
      (!Number.isInteger(patch.unitPriceCents) || patch.unitPriceCents < 0)
    )
      throw new BadRequestException('unitPriceCents must be a non-negative integer');

    return this.tenants.runInTenant(tenantId, async (tx) => {
      const row = await tx.scopePart.findFirst({ where: { id: partId } });
      if (!row) throw new NotFoundException('Part not found');
      const updated = await tx.scopePart.update({
        where: { id: partId },
        data: {
          ...(description !== undefined ? { description } : {}),
          ...(patch.quantity !== undefined ? { quantity: patch.quantity } : {}),
          ...(patch.unitPriceCents !== undefined ? { unitPriceCents: patch.unitPriceCents } : {}),
        },
      });
      return toView(updated);
    });
  }

  /**
   * Card 62.1 — record what the shop is paying and who from. Every field is optional so an estimator
   * can fill in the supplier now and the price when the invoice arrives, which is the real order of
   * events on a workshop floor.
   */
  async setProcurement(
    tenantId: string,
    partId: string,
    patch: SetProcurementInput,
  ): Promise<ScopePartView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const current = await tx.scopePart.findFirst({ where: { id: partId } });
      if (!current) throw new NotFoundException('Part not found');

      if (patch.procurementStatus !== undefined) {
        const from = current.procurementStatus as ProcurementStatus;
        if (!canTransitionTo(from, patch.procurementStatus)) {
          throw new BadRequestException(
            `Cannot move a part from "${from}" to "${patch.procurementStatus}"`,
          );
        }
      }
      if (patch.buyPriceCents !== undefined && patch.buyPriceCents !== null) {
        if (!Number.isInteger(patch.buyPriceCents) || patch.buyPriceCents < 0) {
          throw new BadRequestException('buyPriceCents must be a non-negative integer of cents');
        }
      }

      const updated = await tx.scopePart.update({
        where: { id: partId },
        data: {
          ...(patch.buyPriceCents !== undefined ? { buyPriceCents: patch.buyPriceCents } : {}),
          ...(patch.grade !== undefined ? { grade: patch.grade } : {}),
          ...(patch.procurementStatus !== undefined
            ? { procurementStatus: patch.procurementStatus }
            : {}),
          ...(patch.supplierContactId !== undefined
            ? { supplierContactId: patch.supplierContactId }
            : {}),
          ...(patch.supplierPartNumber !== undefined
            ? { supplierPartNumber: patch.supplierPartNumber }
            : {}),
          ...(patch.expectedAt !== undefined ? { expectedAt: patch.expectedAt } : {}),
        },
      });
      return toView(updated);
    });
  }

  /**
   * Goods-received check-in. Quantities ACCUMULATE rather than overwrite, because a line is often
   * delivered in two drops and the second delivery docket says "1", not "3". Receiving part of a line
   * leaves it back-ordered; receiving the rest closes it.
   */
  async receive(tenantId: string, partId: string, quantity: number): Promise<ScopePartView> {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new BadRequestException('Received quantity must be a positive integer');
    }
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const current = await tx.scopePart.findFirst({ where: { id: partId } });
      if (!current) throw new NotFoundException('Part not found');
      if (current.procurementStatus === 'cancelled') {
        throw new BadRequestException('Cannot receive a cancelled part');
      }

      const receivedQuantity = current.receivedQuantity + quantity;
      const status = statusAfterReceipt(current.quantity, receivedQuantity);
      const updated = await tx.scopePart.update({
        where: { id: partId },
        data: {
          receivedQuantity,
          procurementStatus: status,
          // Stamped on the delivery that COMPLETES the line — that is the date the job was unblocked,
          // which is what anyone looking back at the file actually wants to know.
          ...(status === 'received' ? { receivedAt: new Date() } : {}),
        },
      });
      return toView(updated);
    });
  }

  /** Parts margin for a whole job. Excludes unpriced lines and says how many — see summariseParts. */
  async marginForJob(tenantId: string, jobId: string): Promise<PartsSummary> {
    const parts = await this.listForJob(tenantId, jobId);
    return summariseParts(
      parts.map((p) => ({
        quantity: p.quantity,
        unitPriceCents: p.unitPriceCents,
        buyPriceCents: p.buyPriceCents,
      })),
    );
  }

  async removePart(tenantId: string, partId: string): Promise<void> {
    await this.tenants.runInTenant(tenantId, async (tx) => {
      const row = await tx.scopePart.findFirst({ where: { id: partId } });
      if (!row) throw new NotFoundException('Part not found');
      await tx.scopePart.deleteMany({ where: { id: partId } });
    });
  }

  /**
   * Build a Draft quote from the (fully-priced) parts list, through the shared Quote engine. Every part
   * must be priced first — the money engine forbids <$1 lines, and shipping an unpriced part would be a
   * silent $0. The quote stays Draft; nothing is sent or ordered.
   */
  async buildQuote(tenantId: string, jobId: string): Promise<QuoteView> {
    const parts = await this.listForJob(tenantId, jobId);
    if (parts.length === 0)
      throw new BadRequestException('The parts list is empty — nothing to quote');
    const unpriced = parts.filter((p) => p.unitPriceCents < 1);
    if (unpriced.length > 0) {
      throw new BadRequestException(
        `Price every part before building the quote: ${unpriced.map((p) => p.description).join(', ')}`,
      );
    }

    const quote = await this.quotes.create(tenantId, jobId);
    let view = quote;
    for (const p of parts) {
      view = await this.quotes.addLine(tenantId, quote.id, {
        description: p.description,
        type: 'part',
        quantity: p.quantity,
        unitPriceCents: p.unitPriceCents,
        taxCode: 'GST',
      });
    }
    return view;
  }
}

function assertPartAmounts(quantity: number, unitPriceCents: number): void {
  if (!Number.isInteger(quantity) || quantity < 1)
    throw new BadRequestException('quantity must be an integer ≥ 1');
  if (!Number.isInteger(unitPriceCents) || unitPriceCents < 0)
    throw new BadRequestException('unitPriceCents must be a non-negative integer');
}

function toView(row: {
  id: string;
  workItemId: string;
  damageScopeId: string | null;
  description: string;
  quantity: number;
  unitPriceCents: number;
  priceBookItemId: string | null;
  source: string;
  sortOrder: number;
  buyPriceCents: number | null;
  grade: string | null;
  procurementStatus: string;
  supplierContactId: string | null;
  supplierPartNumber: string | null;
  expectedAt: Date | null;
  receivedAt: Date | null;
  receivedQuantity: number;
}): ScopePartView {
  return {
    id: row.id,
    workItemId: row.workItemId,
    damageScopeId: row.damageScopeId,
    description: row.description,
    quantity: row.quantity,
    unitPriceCents: row.unitPriceCents,
    priceBookItemId: row.priceBookItemId,
    source: row.source as 'ai' | 'manual',
    sortOrder: row.sortOrder,
    buyPriceCents: row.buyPriceCents,
    grade: (row.grade as PartGrade | null) ?? null,
    procurementStatus: row.procurementStatus as ProcurementStatus,
    supplierContactId: row.supplierContactId,
    supplierPartNumber: row.supplierPartNumber,
    expectedAt: row.expectedAt,
    receivedAt: row.receivedAt,
    receivedQuantity: row.receivedQuantity,
    // Derived on read. Storing margin would let it drift from the prices it comes from — the exact
    // failure the card is trying to fix.
    margin: partMargin({
      quantity: row.quantity,
      unitPriceCents: row.unitPriceCents,
      buyPriceCents: row.buyPriceCents,
    }),
  };
}
