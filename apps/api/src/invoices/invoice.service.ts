import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LineItemService } from '../line-items/line-item.service';
import { NotificationService } from '../notifications/notification.service';
import { TenantClient, TenantService } from '../tenancy/tenant.service';
import { buildMoneyOverview, FinanceInvoiceRow, MoneyOverview } from './finance';

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

export interface InvoicePortionView {
  id: string;
  payerContactId: string | null;
  payerName: string | null;
  description: string;
  amountCents: number;
  paidCents: number;
  balanceCents: number;
}

export interface PaymentView {
  id: string;
  portionId: string | null;
  amountCents: number;
  method: string;
  receivedAt: Date;
}

export interface InvoiceView {
  id: string;
  reference: string;
  status: string;
  workItemId: string;
  quoteId: string | null;
  payerContactId: string | null;
  dueDate: Date | null;
  paidAt: Date | null;
  paidBy: string | null;
  subtotalCents: number;
  gstCents: number;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  paidState: 'Unpaid' | 'PartiallyPaid' | 'Paid' | 'Overpaid';
  lines: InvoiceLineView[];
  portions: InvoicePortionView[];
  payments: PaymentView[];
}

export interface PortionInput {
  payerContactId?: string;
  payerName?: string;
  description: string;
  amountCents: number;
}

export interface RecordPaymentInput {
  amountCents: number;
  method: string;
  portionId?: string;
  receivedAt?: string;
}

export interface ExcessSplitInput {
  primaryPayerContactId: string; // e.g. the insurer (billed for the authorised amount)
  primaryAmountCents: number; // e.g. the assessor-authorised amount
  excessAmountCents: number; // the customer's out-of-pocket excess
  excessPayerContactId?: string; // the customer (Contact), if in the system
  excessPayerName?: string; // …or an external name
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

  /** Set the bill-to party (may differ from the served customer). Card #40.5. */
  async setPayer(tenantId: string, id: string, payerContactId: string): Promise<InvoiceView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const inv = await tx.invoice.findFirst({ where: { id } });
      if (!inv) throw new NotFoundException('Invoice not found');
      if (inv.status !== 'Unpaid')
        throw new ConflictException(`Cannot change the payer of a ${inv.status} invoice`);
      const contact = await tx.contact.findFirst({
        where: { id: payerContactId, deletedAt: null },
      });
      if (!contact) throw new NotFoundException('Payer contact not found');
      const updated = await tx.invoice.update({ where: { id }, data: { payerContactId } });
      return this.viewFrom(tx, updated);
    });
  }

  /**
   * Split an invoice across payers (e.g. insurer-authorised vs customer excess). Portions MUST reconcile
   * to the cent against the invoice total; replaces any existing split. Card #40.5.
   */
  async setSplit(tenantId: string, id: string, portions: PortionInput[]): Promise<InvoiceView> {
    if (portions.length === 0) throw new BadRequestException('Provide at least one portion');
    for (const p of portions) {
      if (!Number.isInteger(p.amountCents) || p.amountCents < 1)
        throw new BadRequestException('Each portion amount must be a positive integer (cents)');
      if (!p.payerContactId && !p.payerName?.trim())
        throw new BadRequestException('Each portion needs a payerContactId or a payerName');
    }
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const inv = await tx.invoice.findFirst({ where: { id } });
      if (!inv) throw new NotFoundException('Invoice not found');
      if (inv.status !== 'Unpaid')
        throw new ConflictException(`Cannot split a ${inv.status} invoice`);
      const lines = await tx.lineItem.findMany({
        where: { parentType: 'invoice', parentId: id },
      });
      const total = lines.reduce((s, l) => s + l.lineTotalCents, 0);
      if (total === 0) throw new BadRequestException('Cannot split an invoice with no line items');
      const sum = portions.reduce((s, p) => s + p.amountCents, 0);
      if (sum !== total)
        throw new BadRequestException(
          `Portions (${sum}c) must reconcile to the invoice total (${total}c)`,
        );
      // A portion with a still-existing payment can't be removed — protect recorded money.
      const paid = await tx.payment.findFirst({
        where: { invoiceId: id, portionId: { not: null } },
      });
      if (paid) throw new ConflictException('Cannot re-split an invoice that already has payments');
      for (const contactId of portions.map((p) => p.payerContactId).filter(Boolean) as string[]) {
        const contact = await tx.contact.findFirst({ where: { id: contactId, deletedAt: null } });
        if (!contact) throw new NotFoundException(`Payer contact ${contactId} not found`);
      }
      await tx.invoicePortion.deleteMany({ where: { invoiceId: id } });
      for (const p of portions) {
        await tx.invoicePortion.create({
          data: {
            tenantId,
            invoiceId: id,
            payerContactId: p.payerContactId ?? null,
            payerName: p.payerName?.trim() || null,
            description: p.description,
            amountCents: p.amountCents,
          },
        });
      }
      await this.syncExcessHold(tx, inv.workItemId); // INS-2: a new excess portion holds the job
      return this.viewFrom(tx, inv);
    });
  }

  /**
   * INS-2 — keep the job's `excessOutstanding` flag in step with its invoices. The flag is true while
   * ANY non-void invoice on the job carries a "Customer excess" portion with a balance still owing; the
   * pack's COLLECT guard reads it to block release. Called whenever an excess split or a payment lands.
   *
   * This touches the work-item row directly, mirroring how InvoiceService already reads it
   * (createFromJob, customerRecipient) — a boolean it owns the meaning of, merged into the existing
   * pack-validated fields, so no other field is disturbed.
   */
  private async syncExcessHold(tx: TenantClient, workItemId: string): Promise<void> {
    const invoices = await tx.invoice.findMany({
      where: { workItemId, status: { not: 'Void' } },
      include: { portions: true, payments: true },
    });
    const unpaidExcess = invoices.some((inv) =>
      inv.portions.some((p) => {
        if (p.description !== 'Customer excess') return false;
        const paidToPortion = inv.payments
          .filter((pay) => pay.portionId === p.id)
          .reduce((s, pay) => s + pay.amountCents, 0);
        return p.amountCents - paidToPortion > 0;
      }),
    );
    const job = await tx.workItem.findFirst({ where: { id: workItemId, deletedAt: null } });
    if (!job) return;
    const fields = { ...(job.fields as Record<string, unknown>), excessOutstanding: unpaidExcess };
    await tx.workItem.update({
      where: { id: workItemId },
      data: { fields: fields as Prisma.InputJsonValue },
    });
  }

  /**
   * Record money received against an invoice (optionally a specific portion). Over-payment beyond the
   * invoice total (or a portion's balance) is rejected. Fully paid ⇒ invoice flips to Paid. Card #40.5.
   */
  async recordPayment(
    tenantId: string,
    id: string,
    input: RecordPaymentInput,
    userId: string,
  ): Promise<InvoiceView> {
    if (!Number.isInteger(input.amountCents) || input.amountCents < 1)
      throw new BadRequestException('Payment amount must be a positive integer (cents)');
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const inv = await tx.invoice.findFirst({ where: { id } });
      if (!inv) throw new NotFoundException('Invoice not found');
      if (inv.status === 'Void')
        throw new ConflictException('Cannot record a payment against a Void invoice');
      const lines = await tx.lineItem.findMany({
        where: { parentType: 'invoice', parentId: id },
      });
      const total = lines.reduce((s, l) => s + l.lineTotalCents, 0);
      if (total === 0) throw new BadRequestException('Cannot pay an invoice with no line items');

      const existing = await tx.payment.findMany({ where: { invoiceId: id } });
      const alreadyPaid = existing.reduce((s, p) => s + p.amountCents, 0);
      if (alreadyPaid + input.amountCents > total)
        throw new BadRequestException(
          `Payment would over-pay the invoice (balance ${total - alreadyPaid}c)`,
        );

      if (input.portionId) {
        const portion = await tx.invoicePortion.findFirst({
          where: { id: input.portionId, invoiceId: id },
        });
        if (!portion) throw new NotFoundException('Portion not found on this invoice');
        const portionPaid = existing
          .filter((p) => p.portionId === input.portionId)
          .reduce((s, p) => s + p.amountCents, 0);
        if (portionPaid + input.amountCents > portion.amountCents)
          throw new BadRequestException(
            `Payment would over-pay the portion (balance ${portion.amountCents - portionPaid}c)`,
          );
      }

      await tx.payment.create({
        data: {
          tenantId,
          invoiceId: id,
          portionId: input.portionId ?? null,
          amountCents: input.amountCents,
          method: input.method,
          receivedAt: input.receivedAt ? new Date(input.receivedAt) : new Date(),
        },
      });

      const nowPaid = alreadyPaid + input.amountCents;
      const patch =
        nowPaid === total && inv.status === 'Unpaid'
          ? { status: 'Paid', paidAt: new Date(), paidBy: userId }
          : {};
      const updated =
        Object.keys(patch).length > 0
          ? await tx.invoice.update({ where: { id }, data: patch })
          : inv;
      await this.syncExcessHold(tx, inv.workItemId); // INS-2: paying the excess may release the job
      return this.viewFrom(tx, updated);
    });
  }

  /**
   * Excess handling (card #42): the one-call insured-job split. Bills the primary payer (insurer) for
   * the authorised amount and the customer for the excess, so the shop collects the excess and bills the
   * insurer separately — reconciling to the cent. Generic 2-payer helper (also fits Medicare gap, NDIS
   * co-pay, etc.); the caller supplies the figures (e.g. from the automotive claim block). Card #15 records
   * those figures on the job; this turns them into the money split via the core #40.5 machinery.
   */
  async applyExcessSplit(
    tenantId: string,
    id: string,
    input: ExcessSplitInput,
  ): Promise<InvoiceView> {
    if (!Number.isInteger(input.primaryAmountCents) || input.primaryAmountCents < 0)
      throw new BadRequestException('primaryAmountCents must be a non-negative integer');
    if (!Number.isInteger(input.excessAmountCents) || input.excessAmountCents < 1)
      throw new BadRequestException('excessAmountCents must be a positive integer');
    if (!input.excessPayerContactId && !input.excessPayerName?.trim())
      throw new BadRequestException('An excess payer (contact id or name) is required');

    const portions: PortionInput[] = [
      {
        payerContactId: input.excessPayerContactId,
        payerName: input.excessPayerName,
        description: 'Customer excess',
        amountCents: input.excessAmountCents,
      },
    ];
    // Only include the insurer portion if they actually pay something (a $0 authorised = fully self-paid).
    if (input.primaryAmountCents > 0)
      portions.unshift({
        payerContactId: input.primaryPayerContactId,
        description: 'Insurer authorised',
        amountCents: input.primaryAmountCents,
      });

    await this.setPayer(tenantId, id, input.primaryPayerContactId);
    return this.setSplit(tenantId, id, portions);
  }

  /**
   * Total outstanding across all non-Void invoices (card #52): sum of line totals minus money received.
   * Clamped at 0 (an over-payment doesn't make the shop "owe" money). Tenant-scoped.
   */
  async outstandingCents(tenantId: string): Promise<number> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const invoices = await tx.invoice.findMany({
        where: { status: { not: 'Void' } },
        select: { id: true },
      });
      if (invoices.length === 0) return 0;
      const ids = invoices.map((i) => i.id);
      const [lineSum, paySum] = await Promise.all([
        tx.lineItem.aggregate({
          _sum: { lineTotalCents: true },
          where: { parentType: 'invoice', parentId: { in: ids } },
        }),
        tx.payment.aggregate({ _sum: { amountCents: true }, where: { invoiceId: { in: ids } } }),
      ]);
      const billed = lineSum._sum.lineTotalCents ?? 0;
      const paid = paySum._sum.amountCents ?? 0;
      return Math.max(0, billed - paid);
    });
  }

  /**
   * The owner's money picture (FIN-1) — aggregated read-model over this tenant's invoices/payments.
   * All the maths lives in the pure `buildMoneyOverview`; here we just load the rows it needs.
   * Written-off and void invoices are excluded (not collectible money). Tenant-scoped.
   */
  async financeOverview(tenantId: string): Promise<MoneyOverview> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const invoices = await tx.invoice.findMany({
        where: { status: { notIn: ['Void', 'WrittenOff'] } },
        include: { portions: true, payments: true },
      });
      const ids = invoices.map((i) => i.id);
      const lineSums = ids.length
        ? await tx.lineItem.groupBy({
            by: ['parentId'],
            where: { parentType: 'invoice', parentId: { in: ids } },
            _sum: { lineTotalCents: true },
          })
        : [];
      const billedById = new Map(lineSums.map((l) => [l.parentId, l._sum.lineTotalCents ?? 0]));

      const rows: FinanceInvoiceRow[] = invoices.map((i) => {
        const paidCents = i.payments.reduce((s, p) => s + p.amountCents, 0);
        const lastPaymentAt = i.payments.reduce<Date | null>(
          (a, p) => (a === null || p.receivedAt > a ? p.receivedAt : a),
          null,
        );
        return {
          status: i.status,
          issueDate: i.issueDate,
          dueDate: i.dueDate,
          billedCents: billedById.get(i.id) ?? 0,
          paidCents,
          lastPaymentAt,
          portions: i.portions.map((p) => ({
            payerName: p.payerName,
            payerContactId: p.payerContactId,
            amountCents: p.amountCents,
          })),
        };
      });
      return buildMoneyOverview(rows, new Date());
    });
  }

  /** Money received since a point in time (card #52 — this-week revenue). Tenant-scoped. */
  async revenueSince(tenantId: string, since: Date): Promise<number> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const agg = await tx.payment.aggregate({
        _sum: { amountCents: true },
        where: { receivedAt: { gte: since } },
      });
      return agg._sum.amountCents ?? 0;
    });
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
      payerContactId: string | null;
      dueDate: Date | null;
      paidAt: Date | null;
      paidBy: string | null;
    },
  ): Promise<InvoiceView> {
    const [lines, portionRows, paymentRows] = await Promise.all([
      tx.lineItem.findMany({
        where: { parentType: 'invoice', parentId: inv.id },
        orderBy: { sortOrder: 'asc' },
      }),
      tx.invoicePortion.findMany({ where: { invoiceId: inv.id }, orderBy: { createdAt: 'asc' } }),
      tx.payment.findMany({ where: { invoiceId: inv.id }, orderBy: { receivedAt: 'asc' } }),
    ]);

    const totalCents = lines.reduce((s, l) => s + l.lineTotalCents, 0);
    const paidCents = paymentRows.reduce((s, p) => s + p.amountCents, 0);
    const balanceCents = totalCents - paidCents;

    let paidState: InvoiceView['paidState'] = 'Unpaid';
    if (paidCents > totalCents) paidState = 'Overpaid';
    else if (paidCents > 0 && paidCents < totalCents) paidState = 'PartiallyPaid';
    else if (totalCents > 0 && paidCents === totalCents) paidState = 'Paid';

    const paidPerPortion = new Map<string, number>();
    for (const p of paymentRows) {
      if (p.portionId)
        paidPerPortion.set(p.portionId, (paidPerPortion.get(p.portionId) ?? 0) + p.amountCents);
    }

    return {
      id: inv.id,
      reference: inv.reference,
      status: inv.status,
      workItemId: inv.workItemId,
      quoteId: inv.quoteId,
      payerContactId: inv.payerContactId,
      dueDate: inv.dueDate,
      paidAt: inv.paidAt,
      paidBy: inv.paidBy,
      subtotalCents: lines.reduce((s, l) => s + l.netCents, 0),
      gstCents: lines.reduce((s, l) => s + l.gstCents, 0),
      totalCents,
      paidCents,
      balanceCents,
      paidState,
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
      portions: portionRows.map((p) => {
        const portionPaid = paidPerPortion.get(p.id) ?? 0;
        return {
          id: p.id,
          payerContactId: p.payerContactId,
          payerName: p.payerName,
          description: p.description,
          amountCents: p.amountCents,
          paidCents: portionPaid,
          balanceCents: p.amountCents - portionPaid,
        };
      }),
      payments: paymentRows.map((p) => ({
        id: p.id,
        portionId: p.portionId,
        amountCents: p.amountCents,
        method: p.method,
        receivedAt: p.receivedAt,
      })),
    };
  }
}
