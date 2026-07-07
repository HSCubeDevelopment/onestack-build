import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ContactsService } from '../contacts/contacts.service';
import { InvoiceService } from '../invoices/invoice.service';
import { QuoteService } from '../quotes/quote.service';
import { SubjectService } from '../subjects/subject.service';
import { AttachmentService } from '../work-items/attachment.service';
import { WorkItemService } from '../work-items/work-item.service';
import { claimFileCounts, claimFinancials, ClaimFileCounts, ClaimFinancials } from './claim-file';
import { CLAIM_PACK_SHARER, ClaimPackSharer, ShareResult } from './claim-pack-sharer';

/** The insurance-claim block captured on a job (automotive pack). Read-only here. */
export interface ClaimBlock {
  insurer: string;
  claimNumber: string;
  assessor: string | null;
  dateLodged: string | null;
  authorisedAmountCents: number | null;
  excessCents: number | null;
  billPayer: string | null;
}

export interface ClaimFileView {
  job: { id: string; reference: string; stateName: string; description: string | null };
  claim: ClaimBlock | null;
  customer: { id: string; displayName: string; email: string | null; phone: string | null } | null;
  insurer: { id: string; displayName: string } | null;
  vehicles: { id: string; label: string }[];
  photos: {
    id: string;
    fileName: string;
    caption: string | null;
    contentType: string;
    createdAt: Date;
  }[];
  quotes: { id: string; reference: string; status: string; revision: number; totalCents: number }[];
  invoices: {
    id: string;
    reference: string;
    status: string;
    totalCents: number;
    paidCents: number;
    balanceCents: number;
  }[];
  counts: ClaimFileCounts;
  financials: ClaimFinancials;
}

export interface ClaimFileExport extends ClaimFileView {
  generatedAt: string;
}

/**
 * Claim file (Phase 2). A read-model that groups every artefact for a claim against a job — the claim
 * paperwork, customer, vehicles, photos, quotes and invoices — into one pack a shop can hand an insurer,
 * plus a financial snapshot. No new table: it reads existing data through each domain's public service
 * (never their tables), so it stays tenant-isolated by construction (WorkItemService.get 404s for other
 * tenants, which gates the whole assembly). Export is a self-contained download; sharing externally goes
 * through a vendor boundary (no-op until a provider is wired). No insurer integration in the MVP.
 */
@Injectable()
export class ClaimFileService {
  constructor(
    private readonly workItems: WorkItemService,
    private readonly contacts: ContactsService,
    private readonly subjects: SubjectService,
    private readonly attachments: AttachmentService,
    private readonly quotes: QuoteService,
    private readonly invoices: InvoiceService,
    @Inject(CLAIM_PACK_SHARER) private readonly sharer: ClaimPackSharer,
  ) {}

  async assemble(tenantId: string, jobId: string): Promise<ClaimFileView> {
    const job = await this.workItems.get(tenantId, jobId); // 404s for a missing/other-tenant job
    const fields = job.fields as Record<string, unknown>;
    const claim = toClaimBlock(fields.claim);
    const customerId = typeof fields.customerId === 'string' ? fields.customerId : null;
    const description = typeof fields.description === 'string' ? fields.description : null;

    const [customer, insurer, vehicles, photos, quotes, invoices] = await Promise.all([
      customerId ? this.safeContact(tenantId, customerId) : Promise.resolve(null),
      claim?.insurerContactId
        ? this.safeContact(tenantId, claim.insurerContactId)
        : Promise.resolve(null),
      this.subjects.listForWorkItem(tenantId, jobId),
      this.attachments.list(tenantId, jobId),
      this.quotes.listForJob(tenantId, jobId),
      this.invoices.listForJob(tenantId, jobId),
    ]);

    return {
      job: {
        id: job.id,
        reference: job.reference,
        stateName: job.stateName,
        description,
      },
      claim: claim ? stripInsurerContactId(claim) : null,
      customer: customer
        ? {
            id: customer.id,
            displayName: customer.displayName,
            email: customer.email,
            phone: customer.phone,
          }
        : null,
      insurer: insurer ? { id: insurer.id, displayName: insurer.displayName } : null,
      vehicles: vehicles.map((v) => ({ id: v.id, label: v.label })),
      photos: photos.map((p) => ({
        id: p.id,
        fileName: p.fileName,
        caption: p.caption,
        contentType: p.contentType,
        createdAt: p.createdAt,
      })),
      quotes: quotes.map((q) => ({
        id: q.id,
        reference: q.reference,
        status: q.status,
        revision: q.revision,
        totalCents: q.totalCents,
      })),
      invoices: invoices.map((i) => ({
        id: i.id,
        reference: i.reference,
        status: i.status,
        totalCents: i.totalCents,
        paidCents: i.paidCents,
        balanceCents: i.balanceCents,
      })),
      counts: claimFileCounts({ photos, quotes, invoices }),
      financials: claimFinancials(invoices),
    };
  }

  /** The pack as a self-contained, downloadable export (stamped with when it was produced). */
  async exportPack(tenantId: string, jobId: string, at: Date): Promise<ClaimFileExport> {
    const view = await this.assemble(tenantId, jobId);
    return { ...view, generatedAt: at.toISOString() };
  }

  /** Share the pack externally — the vendor boundary. No-op until a provider is configured. */
  async share(tenantId: string, jobId: string): Promise<ShareResult> {
    const view = await this.assemble(tenantId, jobId);
    return this.sharer.share({
      jobReference: view.job.reference,
      claimNumber: view.claim?.claimNumber ?? null,
    });
  }

  /** A referenced contact may have been removed; a missing one shouldn't break the whole pack. */
  private async safeContact(
    tenantId: string,
    contactId: string,
  ): Promise<{
    id: string;
    displayName: string;
    email: string | null;
    phone: string | null;
  } | null> {
    try {
      const c = await this.contacts.get(tenantId, contactId);
      return { id: c.id, displayName: c.displayName, email: c.email, phone: c.phone };
    } catch (err) {
      if (err instanceof NotFoundException) return null;
      throw err;
    }
  }
}

/** Read the claim block off the job's fields, tolerant of missing/partial data. */
function toClaimBlock(raw: unknown): (ClaimBlock & { insurerContactId?: string }) | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.insurer !== 'string' || typeof c.claimNumber !== 'string') return null;
  return {
    insurer: c.insurer,
    claimNumber: c.claimNumber,
    assessor: typeof c.assessor === 'string' ? c.assessor : null,
    dateLodged: typeof c.dateLodged === 'string' ? c.dateLodged : null,
    authorisedAmountCents:
      typeof c.authorisedAmountCents === 'number' ? c.authorisedAmountCents : null,
    excessCents: typeof c.excessCents === 'number' ? c.excessCents : null,
    billPayer: typeof c.billPayer === 'string' ? c.billPayer : null,
    insurerContactId: typeof c.insurerContactId === 'string' ? c.insurerContactId : undefined,
  };
}

function stripInsurerContactId(c: ClaimBlock & { insurerContactId?: string }): ClaimBlock {
  const { insurerContactId: _omit, ...rest } = c;
  void _omit;
  return rest;
}
