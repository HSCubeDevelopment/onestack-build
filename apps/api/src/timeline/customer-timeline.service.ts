import { Injectable } from '@nestjs/common';
import { ContactsService } from '../contacts/contacts.service';
import { InvoiceService } from '../invoices/invoice.service';
import { QuoteService } from '../quotes/quote.service';
import { NoteService } from '../work-items/note.service';
import { WorkItemService } from '../work-items/work-item.service';
import { buildTimeline, JobInput, NoteInput, TimelineEvent } from './timeline';

export interface CustomerTimelineView {
  contact: { id: string; displayName: string };
  jobCount: number;
  events: TimelineEvent[];
}

/**
 * Customer timeline (Phase 3). A read-model: one chronological activity feed per customer, merging their
 * jobs (with state + a quote/invoice money summary) and the notes on those jobs. No new table — it reads
 * every domain through its public service (WorkItem, Note, Quote, Invoice, Contacts), never their tables,
 * so it's tenant-isolated by construction (ContactsService.get 404s for another tenant's contact, which
 * gates the whole assembly).
 */
@Injectable()
export class CustomerTimelineService {
  constructor(
    private readonly contacts: ContactsService,
    private readonly workItems: WorkItemService,
    private readonly notes: NoteService,
    private readonly quotes: QuoteService,
    private readonly invoices: InvoiceService,
  ) {}

  async build(tenantId: string, contactId: string): Promise<CustomerTimelineView> {
    const contact = await this.contacts.get(tenantId, contactId); // 404s for a missing/other-tenant contact

    // The customer's jobs (generic work items of type 'job' whose customerId field points at this contact).
    const jobs = (await this.workItems.list(tenantId, 'job')).filter(
      (j) => j.fields.customerId === contactId,
    );

    const jobInputs: JobInput[] = [];
    const noteInputs: NoteInput[] = [];
    for (const job of jobs) {
      const [notes, quotes, invoices] = await Promise.all([
        this.notes.list(tenantId, job.id),
        this.quotes.listForJob(tenantId, job.id),
        this.invoices.listForJob(tenantId, job.id),
      ]);
      jobInputs.push({
        id: job.id,
        reference: job.reference,
        stateName: job.stateName,
        createdAt: job.createdAt,
        quoteCount: quotes.length,
        quoteTotalCents: quotes.reduce((s, q) => s + q.totalCents, 0),
        invoiceCount: invoices.length,
        invoiceTotalCents: invoices.reduce((s, i) => s + i.totalCents, 0),
        invoicePaidCents: invoices.reduce((s, i) => s + i.paidCents, 0),
      });
      for (const n of notes) {
        noteInputs.push({
          jobId: job.id,
          jobReference: job.reference,
          body: n.body,
          authorUserId: n.authorUserId,
          createdAt: n.createdAt,
        });
      }
    }

    return {
      contact: { id: contact.id, displayName: contact.displayName },
      jobCount: jobs.length,
      events: buildTimeline(jobInputs, noteInputs),
    };
  }
}
