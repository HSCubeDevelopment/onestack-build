import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenantClient, TenantService } from '../tenancy/tenant.service';
import { poLinesFromParts, poTotalCents } from './po-from-parts';
import { PURCHASE_ORDER_SENDER, PurchaseOrderSender, SendResult } from './purchase-order-sender';
import { ScopePartService } from './scope-part.service';

export type PurchaseOrderStatus = 'draft' | 'confirmed' | 'sent';

export interface PurchaseOrderLineView {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  scopePartId: string | null;
  sortOrder: number;
}

export interface PurchaseOrderView {
  id: string;
  workItemId: string;
  supplierContactId: string | null;
  reference: string;
  status: PurchaseOrderStatus;
  notes: string | null;
  totalCents: number;
  lines: PurchaseOrderLineView[];
}

export interface CreatePurchaseOrderInput {
  supplierContactId?: string | null;
  notes?: string;
}

export interface EditPoLineInput {
  description?: string;
  quantity?: number;
  unitPriceCents?: number;
}

export interface AddPoLineInput {
  description: string;
  quantity?: number;
  unitPriceCents?: number;
}

/**
 * Draft purchase order (Phase 2 flagship, slice C). Seeds a PO from the job's parts list, lets the
 * estimator adjust it (costs are draft), and confirms it — all WITHOUT contacting a supplier. `send`
 * goes through the vendor boundary (PurchaseOrderSender); with the default no-op sender nothing is
 * emailed and the PO stays confirmed. Lines are editable only while the PO is a draft.
 *
 * Reads the parts list through ScopePartService (same module). Its own tables are tenant-scoped via the
 * central wrapper. It never touches the customer money engine — a PO is what we expect to pay a supplier.
 */
@Injectable()
export class PurchaseOrderService {
  constructor(
    private readonly tenants: TenantService,
    private readonly parts: ScopePartService,
    @Inject(PURCHASE_ORDER_SENDER) private readonly sender: PurchaseOrderSender,
  ) {}

  /** Create a draft PO seeded from the job's parts list. */
  async createFromParts(
    tenantId: string,
    jobId: string,
    input: CreatePurchaseOrderInput = {},
  ): Promise<PurchaseOrderView> {
    const parts = await this.parts.listForJob(tenantId, jobId); // 404s if the job isn't this tenant's
    if (parts.length === 0) {
      throw new BadRequestException('The parts list is empty — nothing to order');
    }
    const draftLines = poLinesFromParts(parts);

    return this.tenants.runInTenant(tenantId, async (tx) => {
      const counter = await tx.referenceCounter.upsert({
        where: { tenantId_scope: { tenantId, scope: 'purchase_order' } },
        create: { tenantId, scope: 'purchase_order', value: 1 },
        update: { value: { increment: 1 } },
      });
      const po = await tx.purchaseOrder.create({
        data: {
          tenantId,
          workItemId: jobId,
          supplierContactId: input.supplierContactId ?? null,
          reference: `PO-${String(counter.value).padStart(6, '0')}`,
          status: 'draft',
          notes: input.notes?.trim() || null,
        },
      });
      for (let idx = 0; idx < draftLines.length; idx++) {
        const d = draftLines[idx]!;
        await tx.purchaseOrderLine.create({
          data: {
            tenantId,
            purchaseOrderId: po.id,
            scopePartId: d.scopePartId,
            description: d.description,
            quantity: d.quantity,
            unitPriceCents: d.unitPriceCents,
            sortOrder: idx,
          },
        });
      }
      return this.viewFrom(tx, po.id);
    });
  }

  async listForJob(tenantId: string, jobId: string): Promise<PurchaseOrderView[]> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const job = await tx.workItem.findFirst({ where: { id: jobId, deletedAt: null } });
      if (!job) throw new NotFoundException('Job not found');
      const pos = await tx.purchaseOrder.findMany({
        where: { workItemId: jobId },
        orderBy: { createdAt: 'desc' },
      });
      return Promise.all(pos.map((po) => this.viewFrom(tx, po.id)));
    });
  }

  async get(tenantId: string, poId: string): Promise<PurchaseOrderView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const po = await tx.purchaseOrder.findFirst({ where: { id: poId } });
      if (!po) throw new NotFoundException('Purchase order not found');
      return this.viewFrom(tx, poId);
    });
  }

  async updateHeader(
    tenantId: string,
    poId: string,
    patch: CreatePurchaseOrderInput,
  ): Promise<PurchaseOrderView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      await this.assertDraft(tx, poId);
      await tx.purchaseOrder.update({
        where: { id: poId },
        data: {
          ...(patch.supplierContactId !== undefined
            ? { supplierContactId: patch.supplierContactId }
            : {}),
          ...(patch.notes !== undefined ? { notes: patch.notes?.trim() || null } : {}),
        },
      });
      return this.viewFrom(tx, poId);
    });
  }

  async addLine(tenantId: string, poId: string, input: AddPoLineInput): Promise<PurchaseOrderView> {
    const description = input.description?.trim();
    if (!description) throw new BadRequestException('description is required');
    const quantity = input.quantity ?? 1;
    const unitPriceCents = input.unitPriceCents ?? 0;
    assertLineAmounts(quantity, unitPriceCents);
    return this.tenants.runInTenant(tenantId, async (tx) => {
      await this.assertDraft(tx, poId);
      const last = await tx.purchaseOrderLine.findFirst({
        where: { purchaseOrderId: poId },
        orderBy: { sortOrder: 'desc' },
      });
      await tx.purchaseOrderLine.create({
        data: {
          tenantId,
          purchaseOrderId: poId,
          description,
          quantity,
          unitPriceCents,
          sortOrder: (last?.sortOrder ?? -1) + 1,
        },
      });
      return this.viewFrom(tx, poId);
    });
  }

  async editLine(
    tenantId: string,
    poId: string,
    lineId: string,
    patch: EditPoLineInput,
  ): Promise<PurchaseOrderView> {
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
      await this.assertDraft(tx, poId);
      const line = await tx.purchaseOrderLine.findFirst({
        where: { id: lineId, purchaseOrderId: poId },
      });
      if (!line) throw new NotFoundException('Purchase order line not found');
      await tx.purchaseOrderLine.update({
        where: { id: lineId },
        data: {
          ...(description !== undefined ? { description } : {}),
          ...(patch.quantity !== undefined ? { quantity: patch.quantity } : {}),
          ...(patch.unitPriceCents !== undefined ? { unitPriceCents: patch.unitPriceCents } : {}),
        },
      });
      return this.viewFrom(tx, poId);
    });
  }

  async removeLine(tenantId: string, poId: string, lineId: string): Promise<PurchaseOrderView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      await this.assertDraft(tx, poId);
      const line = await tx.purchaseOrderLine.findFirst({
        where: { id: lineId, purchaseOrderId: poId },
      });
      if (!line) throw new NotFoundException('Purchase order line not found');
      await tx.purchaseOrderLine.deleteMany({ where: { id: lineId } });
      return this.viewFrom(tx, poId);
    });
  }

  /** Human confirms the draft is correct. Requires at least one line. Still NOT sent. */
  async confirm(tenantId: string, poId: string): Promise<PurchaseOrderView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const po = await tx.purchaseOrder.findFirst({ where: { id: poId } });
      if (!po) throw new NotFoundException('Purchase order not found');
      if (po.status !== 'draft')
        throw new ConflictException(`Only a draft PO can be confirmed (this one is ${po.status})`);
      const lineCount = await tx.purchaseOrderLine.count({ where: { purchaseOrderId: poId } });
      if (lineCount === 0) throw new BadRequestException('Cannot confirm a PO with no lines');
      await tx.purchaseOrder.update({ where: { id: poId }, data: { status: 'confirmed' } });
      return this.viewFrom(tx, poId);
    });
  }

  /**
   * Email the PO to the supplier — the vendor boundary. Requires a confirmed PO. Goes through the
   * configured sender; with the default no-op sender nothing is emailed and the PO stays confirmed.
   * Returns the PO plus the send result so the caller can surface "not sent — no provider".
   */
  async send(
    tenantId: string,
    poId: string,
  ): Promise<{ purchaseOrder: PurchaseOrderView; result: SendResult }> {
    const view = await this.tenants.runInTenant(tenantId, async (tx) => {
      const po = await tx.purchaseOrder.findFirst({ where: { id: poId } });
      if (!po) throw new NotFoundException('Purchase order not found');
      if (po.status === 'draft') throw new ConflictException('Confirm the PO before sending it');
      return this.viewFrom(tx, poId);
    });

    const result = await this.sender.send({
      reference: view.reference,
      supplierContactId: view.supplierContactId,
      lineCount: view.lines.length,
      totalCents: view.totalCents,
    });

    if (result.delivered) {
      const updated = await this.tenants.runInTenant(tenantId, async (tx) => {
        await tx.purchaseOrder.update({ where: { id: poId }, data: { status: 'sent' } });
        return this.viewFrom(tx, poId);
      });
      return { purchaseOrder: updated, result };
    }
    return { purchaseOrder: view, result };
  }

  private async assertDraft(tx: TenantClient, poId: string): Promise<void> {
    const po = await tx.purchaseOrder.findFirst({ where: { id: poId } });
    if (!po) throw new NotFoundException('Purchase order not found');
    if (po.status !== 'draft')
      throw new ConflictException('Purchase order is not editable (not a draft)');
  }

  private async viewFrom(tx: TenantClient, poId: string): Promise<PurchaseOrderView> {
    const po = await tx.purchaseOrder.findFirst({ where: { id: poId } });
    if (!po) throw new NotFoundException('Purchase order not found');
    const lines = await tx.purchaseOrderLine.findMany({
      where: { purchaseOrderId: poId },
      orderBy: { sortOrder: 'asc' },
    });
    return {
      id: po.id,
      workItemId: po.workItemId,
      supplierContactId: po.supplierContactId,
      reference: po.reference,
      status: po.status as PurchaseOrderStatus,
      notes: po.notes,
      totalCents: poTotalCents(lines),
      lines: lines.map((l) => ({
        id: l.id,
        description: l.description,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        lineTotalCents: l.quantity * l.unitPriceCents,
        scopePartId: l.scopePartId,
        sortOrder: l.sortOrder,
      })),
    };
  }
}

function assertLineAmounts(quantity: number, unitPriceCents: number): void {
  if (!Number.isInteger(quantity) || quantity < 1)
    throw new BadRequestException('quantity must be an integer ≥ 1');
  if (!Number.isInteger(unitPriceCents) || unitPriceCents < 0)
    throw new BadRequestException('unitPriceCents must be a non-negative integer');
}
