import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenantClient, TenantService } from '../tenancy/tenant.service';
import {
  normaliseInvoiceLines,
  RawInvoiceLine,
  supplierInvoiceTotalCents,
  SupplierInvoiceStatus,
} from './supplier-invoice';
import {
  BOOKKEEPING_SYNC,
  BookkeepingResult,
  BookkeepingSync,
  OcrScanResult,
  SUPPLIER_INVOICE_OCR,
  SupplierInvoiceOcr,
} from './supplier-invoice-vendors';

export interface SupplierInvoiceLineView {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  sortOrder: number;
}

export interface SupplierInvoiceView {
  id: string;
  workItemId: string;
  supplierContactId: string | null;
  invoiceNumber: string;
  invoiceDate: string | null;
  status: SupplierInvoiceStatus;
  source: 'manual' | 'ocr';
  notes: string | null;
  totalCents: number;
  lines: SupplierInvoiceLineView[];
}

export interface CreateSupplierInvoiceInput {
  supplierContactId?: string | null;
  invoiceNumber: string;
  invoiceDate?: string;
  notes?: string;
  lines: RawInvoiceLine[];
}

export interface UpdateSupplierInvoiceInput {
  supplierContactId?: string | null;
  invoiceNumber?: string;
  invoiceDate?: string | null;
  notes?: string;
}

export interface EditInvoiceLineInput {
  description?: string;
  quantity?: number;
  unitPriceCents?: number;
}

/**
 * Supplier invoice capture (Phase 2). Capture a supplier's invoice against a job as an editable draft a
 * human confirms, then (through a vendor boundary) push it to accounting. Reading a scanned invoice via
 * OCR and pushing to Xero/MYOB are deferred and stubbed — no-op until wired, so nothing external happens.
 * Its own tables are tenant-scoped via the central wrapper; a supplier invoice never touches the customer
 * money engine (it's what we OWE, not a customer document). Lines are editable only while draft.
 */
@Injectable()
export class SupplierInvoiceService {
  constructor(
    private readonly tenants: TenantService,
    @Inject(SUPPLIER_INVOICE_OCR) private readonly ocr: SupplierInvoiceOcr,
    @Inject(BOOKKEEPING_SYNC) private readonly accounting: BookkeepingSync,
  ) {}

  async create(
    tenantId: string,
    jobId: string,
    input: CreateSupplierInvoiceInput,
  ): Promise<SupplierInvoiceView> {
    const invoiceNumber = input.invoiceNumber?.trim();
    if (!invoiceNumber) throw new BadRequestException('invoiceNumber is required');
    const lines = normaliseInvoiceLines(input.lines, (m) => new BadRequestException(m));

    return this.tenants.runInTenant(tenantId, async (tx) => {
      const job = await tx.workItem.findFirst({ where: { id: jobId, deletedAt: null } });
      if (!job) throw new NotFoundException('Job not found');
      const inv = await tx.supplierInvoice.create({
        data: {
          tenantId,
          workItemId: jobId,
          supplierContactId: input.supplierContactId ?? null,
          invoiceNumber,
          invoiceDate: input.invoiceDate?.trim() || null,
          status: 'draft',
          source: 'manual',
          notes: input.notes?.trim() || null,
        },
      });
      for (let idx = 0; idx < lines.length; idx++) {
        const l = lines[idx]!;
        await tx.supplierInvoiceLine.create({
          data: {
            tenantId,
            supplierInvoiceId: inv.id,
            description: l.description,
            quantity: l.quantity,
            unitPriceCents: l.unitPriceCents,
            sortOrder: idx,
          },
        });
      }
      return this.viewFrom(tx, inv.id);
    });
  }

  async listForJob(tenantId: string, jobId: string): Promise<SupplierInvoiceView[]> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const job = await tx.workItem.findFirst({ where: { id: jobId, deletedAt: null } });
      if (!job) throw new NotFoundException('Job not found');
      const rows = await tx.supplierInvoice.findMany({
        where: { workItemId: jobId },
        orderBy: { createdAt: 'desc' },
      });
      return Promise.all(rows.map((r) => this.viewFrom(tx, r.id)));
    });
  }

  async get(tenantId: string, id: string): Promise<SupplierInvoiceView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const inv = await tx.supplierInvoice.findFirst({ where: { id } });
      if (!inv) throw new NotFoundException('Supplier invoice not found');
      return this.viewFrom(tx, id);
    });
  }

  async updateHeader(
    tenantId: string,
    id: string,
    patch: UpdateSupplierInvoiceInput,
  ): Promise<SupplierInvoiceView> {
    if (patch.invoiceNumber !== undefined && !patch.invoiceNumber.trim())
      throw new BadRequestException('invoiceNumber cannot be empty');
    return this.tenants.runInTenant(tenantId, async (tx) => {
      await this.assertDraft(tx, id);
      await tx.supplierInvoice.update({
        where: { id },
        data: {
          ...(patch.supplierContactId !== undefined
            ? { supplierContactId: patch.supplierContactId }
            : {}),
          ...(patch.invoiceNumber !== undefined
            ? { invoiceNumber: patch.invoiceNumber.trim() }
            : {}),
          ...(patch.invoiceDate !== undefined
            ? { invoiceDate: patch.invoiceDate?.trim() || null }
            : {}),
          ...(patch.notes !== undefined ? { notes: patch.notes?.trim() || null } : {}),
        },
      });
      return this.viewFrom(tx, id);
    });
  }

  async editLine(
    tenantId: string,
    id: string,
    lineId: string,
    patch: EditInvoiceLineInput,
  ): Promise<SupplierInvoiceView> {
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
      await this.assertDraft(tx, id);
      const line = await tx.supplierInvoiceLine.findFirst({
        where: { id: lineId, supplierInvoiceId: id },
      });
      if (!line) throw new NotFoundException('Supplier invoice line not found');
      await tx.supplierInvoiceLine.update({
        where: { id: lineId },
        data: {
          ...(description !== undefined ? { description } : {}),
          ...(patch.quantity !== undefined ? { quantity: patch.quantity } : {}),
          ...(patch.unitPriceCents !== undefined ? { unitPriceCents: patch.unitPriceCents } : {}),
        },
      });
      return this.viewFrom(tx, id);
    });
  }

  async removeLine(tenantId: string, id: string, lineId: string): Promise<SupplierInvoiceView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      await this.assertDraft(tx, id);
      const line = await tx.supplierInvoiceLine.findFirst({
        where: { id: lineId, supplierInvoiceId: id },
      });
      if (!line) throw new NotFoundException('Supplier invoice line not found');
      await tx.supplierInvoiceLine.deleteMany({ where: { id: lineId } });
      return this.viewFrom(tx, id);
    });
  }

  /** Human confirms the captured invoice is correct. Requires at least one line. Still not exported. */
  async confirm(tenantId: string, id: string): Promise<SupplierInvoiceView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const inv = await tx.supplierInvoice.findFirst({ where: { id } });
      if (!inv) throw new NotFoundException('Supplier invoice not found');
      if (inv.status !== 'draft')
        throw new ConflictException(
          `Only a draft invoice can be confirmed (this one is ${inv.status})`,
        );
      const lineCount = await tx.supplierInvoiceLine.count({ where: { supplierInvoiceId: id } });
      if (lineCount === 0) throw new BadRequestException('Cannot confirm an invoice with no lines');
      await tx.supplierInvoice.update({ where: { id }, data: { status: 'confirmed' } });
      return this.viewFrom(tx, id);
    });
  }

  /**
   * Push a confirmed invoice to accounting — the vendor boundary. With the no-op sync nothing is pushed
   * and the invoice stays confirmed; it only advances to 'exported' once a real push succeeds.
   */
  async exportToAccounting(
    tenantId: string,
    id: string,
  ): Promise<{ invoice: SupplierInvoiceView; result: BookkeepingResult }> {
    const view = await this.tenants.runInTenant(tenantId, async (tx) => {
      const inv = await tx.supplierInvoice.findFirst({ where: { id } });
      if (!inv) throw new NotFoundException('Supplier invoice not found');
      if (inv.status === 'draft')
        throw new ConflictException('Confirm the invoice before exporting it');
      return this.viewFrom(tx, id);
    });

    const result = await this.accounting.push({
      invoiceNumber: view.invoiceNumber,
      supplierContactId: view.supplierContactId,
      totalCents: view.totalCents,
    });

    if (result.exported) {
      const updated = await this.tenants.runInTenant(tenantId, async (tx) => {
        await tx.supplierInvoice.update({ where: { id }, data: { status: 'exported' } });
        return this.viewFrom(tx, id);
      });
      return { invoice: updated, result };
    }
    return { invoice: view, result };
  }

  /**
   * OCR a scanned invoice into a suggested draft — the other vendor boundary. Returns a suggestion the
   * caller uses to pre-fill a create; with the no-op OCR it returns nothing and says to enter it manually.
   * Reads nothing itself here — the real OCR fetches the attachment bytes. Job ownership is checked first.
   */
  async scan(tenantId: string, jobId: string, attachmentId: string): Promise<OcrScanResult> {
    await this.tenants.runInTenant(tenantId, async (tx) => {
      const job = await tx.workItem.findFirst({ where: { id: jobId, deletedAt: null } });
      if (!job) throw new NotFoundException('Job not found');
    });
    return this.ocr.scan({ attachmentId });
  }

  private async assertDraft(tx: TenantClient, id: string): Promise<void> {
    const inv = await tx.supplierInvoice.findFirst({ where: { id } });
    if (!inv) throw new NotFoundException('Supplier invoice not found');
    if (inv.status !== 'draft')
      throw new ConflictException('Supplier invoice is not editable (not a draft)');
  }

  private async viewFrom(tx: TenantClient, id: string): Promise<SupplierInvoiceView> {
    const inv = await tx.supplierInvoice.findFirst({ where: { id } });
    if (!inv) throw new NotFoundException('Supplier invoice not found');
    const lines = await tx.supplierInvoiceLine.findMany({
      where: { supplierInvoiceId: id },
      orderBy: { sortOrder: 'asc' },
    });
    return {
      id: inv.id,
      workItemId: inv.workItemId,
      supplierContactId: inv.supplierContactId,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      status: inv.status as SupplierInvoiceStatus,
      source: inv.source as 'manual' | 'ocr',
      notes: inv.notes,
      totalCents: supplierInvoiceTotalCents(lines),
      lines: lines.map((l) => ({
        id: l.id,
        description: l.description,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        lineTotalCents: l.quantity * l.unitPriceCents,
        sortOrder: l.sortOrder,
      })),
    };
  }
}
