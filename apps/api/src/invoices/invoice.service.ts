import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LineItemService } from '../line-items/line-item.service';
import { NotificationService } from '../notifications/notification.service';
import { TenantClient, TenantService } from '../tenancy/tenant.service';

export interface InvoiceLineInput {
  description: string;
  type: 'labour' | 'part';
  quantity: number;
  unitPriceCents: number;
  taxCode?: 'GST' | 'GST_FREE';
}

export interface InvoiceLineView {
  id: string;
  description: string;
  type: string;
  quantity: number;
  unitPriceCents: number;
  netCents: number;
  gstCents: number;
  lineTotalCents: number;
}

export interface InvoiceView {
  id: string;
  reference: string;
  status: string;
  workItemId: string;
  quoteId: string | null;
  dueDate: Date | null;
  paidAt: Date | null;
  paidBy: string | null;
  subtotalCents: number;
  gstCents: number;
  totalCents: number;
  lines: InvoiceLineView[];
}

/**
 * Invoice (card #40): from a job or an accepted quote (line items copied across, then editable). Shares
 * the ONE money engine (#6.9 / #29) with quotes, so totals never drift. Paid manually — records who +
 * when. Editable only while Unpaid; an empty invoice can't be sent or marked paid.
 */
@Injectable()
export class InvoiceService {
  constructor(
    private readonly tenants: TenantService,
    private readonly lineItems: LineItemService,
    private readonly notifications: NotificationService,
  ) {}

  async createFromJob(tenantId: string, jobId: string, dueDate?: string): Promise<InvoiceView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const job = await tx.workItem.findFirst({ where: { id: jobId, deletedAt: null } });
      if (!job) throw new NotFoundException('Job not found');
      const inv = await this.insert(tx, tenantId, jobId, null, dueDate);
      return this.viewFrom(tx, inv);
    });
  }

  async createFromQuote(tenantId: string, quoteId: string, dueDate?: string): Promise<InvoiceView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const quote = await tx.quote.findFirst({ where: { id: quoteId } });
      if (!quote) throw new NotFoundException('Quote not found');
      const inv = await this.insert(tx, tenantId, quote.workItemId, quoteId, dueDate);
      // Copy the quote's line items across (verbatim — money already computed).
      const src = await tx.lineItem.findMany({
        where: { parentType: 'quote', parentId: quoteId },
        orderBy: { sortOrder: 'asc' },
      });
      for (const l of src) {
        await tx.lineItem.create({
          data: {
            tenantId,
            parentType: 'invoice',
            parentId: inv.id,
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
      return this.viewFrom(tx, inv);
    });
  }

  async get(tenantId: string, id: string): Promise<InvoiceView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const inv = await tx.invoice.findFirst({ where: { id } });
      if (!inv) throw new NotFoundException('Invoice not found');
      return this.viewFrom(tx, inv);
    });
  }

  async listForJob(tenantId: string, jobId: string): Promise<InvoiceView[]> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const rows = await tx.invoice.findMany({
        where: { workItemId: jobId },
        orderBy: { createdAt: 'desc' },
      });
      return Promise.all(rows.map((i) => this.viewFrom(tx, i)));
    });
  }

  async addLine(tenantId: string, id: string, input: InvoiceLineInput): Promise<InvoiceView> {
    if (input.quantity < 1 || input.unitPriceCents < 1)
      throw new BadRequestException('quantity and price must be ≥ 1');
    await this.assertUnpaid(tenantId, id);
    await this.lineItems.add(
      tenantId,
      { parentType: 'invoice', parentId: id },
      {
        description: input.description,
        type: input.type === 'part' ? 'product' : 'labour',
        quantity: input.quantity,
        unitPriceCents: input.unitPriceCents,
        taxCode: input.taxCode ?? 'GST',
        taxTreatment: 'exclusive',
      },
    );
    return this.get(tenantId, id);
  }

  async removeLine(tenantId: string, id: string, lineId: string): Promise<InvoiceView> {
    await this.assertUnpaid(tenantId, id);
    await this.lineItems.remove(tenantId, lineId);
    return this.get(tenantId, id);
  }

  /** Mark an Unpaid invoice Paid — records who + when. Blocked if it has no lines. */
  async markPaid(tenantId: string, id: string, userId: string): Promise<InvoiceView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const inv = await tx.invoice.findFirst({ where: { id } });
      if (!inv) throw new NotFoundException('Invoice not found');
      if (inv.status !== 'Unpaid')
        throw new ConflictException(`Cannot pay a ${inv.status} invoice`);
      const lineCount = await tx.lineItem.count({ where: { parentType: 'invoice', parentId: id } });
      if (lineCount === 0)
        throw new BadRequestException('Cannot pay an invoice with no line items');
      await tx.invoice.update({
        where: { id },
        data: { status: 'Paid', paidAt: new Date(), paidBy: userId },
      });
      return this.viewFrom(tx, { ...inv, status: 'Paid', paidBy: userId, paidAt: new Date() });
    });
  }

  async void(tenantId: string, id: string): Promise<InvoiceView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const inv = await tx.invoice.findFirst({ where: { id } });
      if (!inv) throw new NotFoundException('Invoice not found');
      await tx.invoice.update({ where: { id }, data: { status: 'Void' } });
      return this.viewFrom(tx, { ...inv, status: 'Void' });
    });
  }

  /** "Send" the invoice — enqueue a customer notification (real email/SMS is the comms card #50). */
  async send(tenantId: string, id: string): Promise<{ sent: true }> {
    const view = await this.get(tenantId, id);
    if (view.lines.length === 0)
      throw new BadRequestException('Cannot send an invoice with no line items');
    const recipient = await this.customerRecipient(tenantId, view.workItemId);
    await this.notifications.enqueue({
      tenantId,
      channel: recipient.channel,
      recipient: recipient.to,
      template: 'invoice.sent',
      payload: { invoiceId: id, reference: view.reference, totalCents: view.totalCents },
    });
    return { sent: true };
  }

  private async insert(
    tx: TenantClient,
    tenantId: string,
    jobId: string,
    quoteId: string | null,
    dueDate?: string,
  ) {
    const counter = await tx.referenceCounter.upsert({
      where: { tenantId_scope: { tenantId, scope: 'invoice' } },
      create: { tenantId, scope: 'invoice', value: 1 },
      update: { value: { increment: 1 } },
    });
    return tx.invoice.create({
      data: {
        tenantId,
        workItemId: jobId,
        quoteId,
        reference: `INV-${String(counter.value).padStart(6, '0')}`,
        status: 'Unpaid',
        dueDate: dueDate ? new Date(dueDate) : null,
      },
    });
  }

  private async assertUnpaid(tenantId: string, id: string): Promise<void> {
    const inv = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.invoice.findFirst({ where: { id } }),
    );
    if (!inv) throw new NotFoundException('Invoice not found');
    if (inv.status !== 'Unpaid')
      throw new ConflictException('Invoice is not editable (void it first)');
  }

  private async customerRecipient(
    tenantId: string,
    jobId: string,
  ): Promise<{ channel: 'email' | 'in_app'; to: string }> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const job = await tx.workItem.findFirst({ where: { id: jobId } });
      const customerId = (job?.fields as { customerId?: string } | null)?.customerId;
      if (customerId) {
        const contact = await tx.contact.findFirst({ where: { id: customerId } });
        if (contact?.email) return { channel: 'email', to: contact.email };
        if (customerId) return { channel: 'in_app', to: customerId };
      }
      return { channel: 'in_app', to: jobId };
    });
  }

  private async viewFrom(
    tx: TenantClient,
    inv: {
      id: string;
      reference: string;
      status: string;
      workItemId: string;
      quoteId: string | null;
      dueDate: Date | null;
      paidAt: Date | null;
      paidBy: string | null;
    },
  ): Promise<InvoiceView> {
    const lines = await tx.lineItem.findMany({
      where: { parentType: 'invoice', parentId: inv.id },
      orderBy: { sortOrder: 'asc' },
    });
    return {
      id: inv.id,
      reference: inv.reference,
      status: inv.status,
      workItemId: inv.workItemId,
      quoteId: inv.quoteId,
      dueDate: inv.dueDate,
      paidAt: inv.paidAt,
      paidBy: inv.paidBy,
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
