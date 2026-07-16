import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ContactsService } from '../contacts/contacts.service';
import { DocumentRecordService } from '../documents/document-record.service';
import { SignatureService } from '../documents/signature.service';
import { InvoiceService } from '../invoices/invoice.service';
import { OnlineBookingService } from '../online-booking/online-booking.service';
import { PrismaService } from '../prisma/prisma.service';
import { QuoteService } from '../quotes/quote.service';
import { TenantService } from '../tenancy/tenant.service';
import { WorkItemService } from '../work-items/work-item.service';

export interface PortalLink {
  contactId: string;
  /** Relative path of the customer's passwordless portal page. */
  portalUrl: string;
}

export interface PortalHome {
  customer: { name: string };
  jobs: Array<{ reference: string; status: string }>;
  quotes: Array<{ id: string; reference: string; status: string; totalCents: number }>;
  documents: Array<{ id: string; type: string; signUrl: string | null }>;
  /** Read-only — online payments are deferred to the payments phase. */
  invoices: Array<{ reference: string; status: string; totalCents: number; balanceCents: number }>;
  payments: { online: false; note: string };
  /** Public branded booking link, when the shop has an enabled booking page. */
  bookingUrl: string | null;
}

function portalUrlFor(token: string): string {
  return `/public/portal/${token}`;
}

/** The customer a work item belongs to lives in its generic `fields.customerId`. */
function customerIdOf(w: { fields: Record<string, unknown> }): string | null {
  const id = w.fields?.customerId;
  return typeof id === 'string' && id ? id : null;
}

/**
 * Customer / client portal (Phase 3, card #150). A passwordless, tenant-scoped, per-customer self-service
 * page: their jobs, documents (with any pending e-sign link), quotes (approve/decline) and invoices
 * (read-only — online PAYMENTS are deferred), plus the shop's branded booking link. GENERIC core. We do
 * NOT hand-roll customer auth — the unguessable token is the credential (resolved via the BYPASSRLS admin
 * connection, never a client id) and can be revoked. Composes existing services; owns only its token table.
 * Everything is filtered to the token's own customer so one customer can never see another's data.
 */
@Injectable()
export class PortalService {
  constructor(
    private readonly tenants: TenantService,
    private readonly prisma: PrismaService,
    private readonly contacts: ContactsService,
    private readonly workItems: WorkItemService,
    private readonly quotes: QuoteService,
    private readonly invoices: InvoiceService,
    private readonly documents: DocumentRecordService,
    private readonly signatures: SignatureService,
    private readonly booking: OnlineBookingService,
  ) {}

  /** Owner: issue (or reuse) a passwordless portal link for a customer. Nothing is sent — share the link. */
  async issueLink(tenantId: string, contactId: string, userId: string): Promise<PortalLink> {
    await this.contacts.get(tenantId, contactId); // 404s for another tenant's contact

    const existing = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.portalAccess.findFirst({ where: { contactId, revokedAt: null } }),
    );
    if (existing) return { contactId, portalUrl: portalUrlFor(existing.token) };

    const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
    await this.tenants.runInTenant(tenantId, (tx) =>
      tx.portalAccess.create({ data: { tenantId, contactId, token, createdByUserId: userId } }),
    );
    return { contactId, portalUrl: portalUrlFor(token) };
  }

  /** Owner: revoke a customer's portal access. */
  async revoke(tenantId: string, contactId: string): Promise<{ revoked: true }> {
    await this.tenants.runInTenant(tenantId, (tx) =>
      tx.portalAccess.updateMany({
        where: { contactId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
    return { revoked: true };
  }

  /** PUBLIC: the customer's portal home, assembled from their own jobs only. */
  async home(token: string): Promise<PortalHome> {
    const access = await this.resolve(token);
    const { tenantId, contactId } = access;

    const contact = await this.contacts.get(tenantId, contactId);
    const allJobs = await this.workItems.list(tenantId);
    const myJobs = allJobs.filter((w) => customerIdOf(w) === contactId);

    const jobs = myJobs.map((j) => ({ reference: j.reference, status: j.stateName }));

    // Quotes, invoices and documents gathered per the customer's own jobs.
    const perJob = await Promise.all(
      myJobs.map(async (j) => {
        const [quotes, invoices, documents] = await Promise.all([
          this.quotes.listForJob(tenantId, j.id),
          this.invoices.listForJob(tenantId, j.id),
          this.documents.list(tenantId, 'work_item', j.id),
        ]);
        return { quotes, invoices, documents };
      }),
    );

    const quotes = perJob
      .flatMap((p) => p.quotes)
      .map((q) => ({
        id: q.id,
        reference: q.reference,
        status: q.status,
        totalCents: q.totalCents,
      }));

    const invoices = perJob
      .flatMap((p) => p.invoices)
      .map((i) => ({
        reference: i.reference,
        status: i.status,
        totalCents: i.totalCents,
        balanceCents: i.balanceCents,
      }));

    const docRecords = perJob.flatMap((p) => p.documents);
    const documents = await Promise.all(
      docRecords.map(async (d) => {
        const sigs = await this.signatures.listForDocument(tenantId, d.id);
        const pending = sigs.find((s) => s.status === 'pending');
        return { id: d.id, type: d.type, signUrl: pending?.signUrl ?? null };
      }),
    );

    const page = await this.booking.getConfig(tenantId);
    const bookingUrl =
      page.exists && page.enabled && page.publicToken
        ? `/public/booking/${page.publicToken}`
        : null;

    return {
      customer: { name: contact.displayName },
      jobs,
      quotes,
      documents,
      invoices,
      payments: {
        online: false,
        note: 'Online payments are coming soon — please pay as arranged with the shop.',
      },
      bookingUrl,
    };
  }

  /** PUBLIC: the customer approves or declines a Sent quote on one of their own jobs. */
  async decideQuote(
    token: string,
    quoteId: string,
    decision: 'accept' | 'decline',
  ): Promise<{ status: string }> {
    if (decision !== 'accept' && decision !== 'decline')
      throw new BadRequestException('decision must be accept or decline');
    const access = await this.resolve(token);
    const { tenantId, contactId } = access;

    const quote = await this.quotes.get(tenantId, quoteId); // 404 if not this tenant's
    const job = await this.workItems.get(tenantId, quote.workItemId);
    if (customerIdOf(job) !== contactId)
      throw new ForbiddenException('That quote is not on your job');

    const updated = await this.quotes.setStatus(
      tenantId,
      quoteId,
      decision === 'accept' ? 'Accepted' : 'Declined',
    );
    return { status: updated.status };
  }

  private async resolve(token: string): Promise<{ tenantId: string; contactId: string }> {
    const access = await this.prisma.portalAccess.findFirst({
      where: { token, revokedAt: null },
      select: { tenantId: true, contactId: true },
    });
    if (!access) throw new NotFoundException('Portal link not found or revoked');
    return access;
  }
}
