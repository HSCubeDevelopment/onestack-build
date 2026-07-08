import { Injectable } from '@nestjs/common';
import { ContactsService, ContactView } from '../contacts/contacts.service';
import { BookingService } from '../scheduling/booking.service';
import { WorkItemService, WorkItemView } from '../work-items/work-item.service';
import {
  ChurnSignals,
  draftReengagementMessage,
  medianGapDays,
  NoShowSignals,
  RiskScore,
  scoreChurn,
  scoreNoShow,
} from './insights';

const DAY_MS = 1000 * 60 * 60 * 24;

export interface NoShowRisk extends RiskScore {
  bookingId: string;
  title: string;
  startsAt: string;
  contactId: string | null;
}

export interface ChurnRisk extends RiskScore {
  contactId: string;
  displayName: string;
  jobCount: number;
  lastActivityAt: string;
  /** DRAFT re-engagement message — staff review before sending; nothing auto-sends. */
  draftMessage: string;
}

export interface ActivitySummary {
  contactId: string;
  displayName: string;
  jobCount: number;
  lastActivityAt: string | null;
  states: Record<string, number>;
  /** Deterministic plain-English recap of the customer's activity. */
  summary: string;
}

/** The customer a work item belongs to lives in its generic `fields.customerId` (set by the pack). */
function customerIdOf(w: WorkItemView): string | null {
  const id = w.fields?.customerId;
  return typeof id === 'string' && id ? id : null;
}

/**
 * AI insights & prediction (Phase 3, card #142). GENERIC core: predicts no-show and churn risk, drafts a
 * re-engagement message for at-risk customers, and summarises a customer's activity. It READS existing
 * data through the owning services (bookings, work items, contacts) — it never queries another module's
 * tables and stores nothing of its own. Every prediction is explainable and every message is a DRAFT a
 * human reviews; nothing acts automatically. Tenant-scoped (the services enforce it).
 */
@Injectable()
export class InsightsService {
  /** Clock, overridable in tests. Not a constructor param so Nest doesn't try to inject it. */
  now: () => Date = () => new Date();

  constructor(
    private readonly bookings: BookingService,
    private readonly workItems: WorkItemService,
    private readonly contacts: ContactsService,
  ) {}

  /** Upcoming appointments ranked by no-show risk, with the reasons behind each score. */
  async noShowRisk(tenantId: string): Promise<NoShowRisk[]> {
    const now = this.now();
    const upcoming = await this.bookings.list(tenantId, now.toISOString());
    if (upcoming.length === 0) return [];

    const items = await this.workItems.list(tenantId);
    const customerByWorkItem = new Map<string, string>();
    const jobCountByCustomer = new Map<string, number>();
    for (const w of items) {
      const cid = customerIdOf(w);
      if (!cid) continue;
      customerByWorkItem.set(w.id, cid);
      jobCountByCustomer.set(cid, (jobCountByCustomer.get(cid) ?? 0) + 1);
    }
    const contacts = await this.contacts.list(tenantId);
    const contactById = new Map(contacts.map((c) => [c.id, c]));

    const out = upcoming.map((b) => {
      const contactId = b.workItemId ? customerByWorkItem.get(b.workItemId) ?? null : null;
      const contact = contactId ? contactById.get(contactId) : undefined;
      const signals: NoShowSignals = {
        daysUntil: (b.startsAt.getTime() - now.getTime()) / DAY_MS,
        isNewCustomer: contactId ? (jobCountByCustomer.get(contactId) ?? 0) <= 1 : true,
        hasReminderContact: !!(contact?.phone || contact?.email),
      };
      const risk = scoreNoShow(signals);
      return {
        ...risk,
        bookingId: b.id,
        title: b.title,
        startsAt: b.startsAt.toISOString(),
        contactId,
      };
    });
    return out.sort((a, b) => b.score - a.score);
  }

  /** Customers at risk of churning, each with a DRAFT re-engagement message. Low-risk are omitted. */
  async churnRisk(tenantId: string): Promise<ChurnRisk[]> {
    const now = this.now();
    const items = await this.workItems.list(tenantId);
    const timestampsByCustomer = new Map<string, number[]>();
    for (const w of items) {
      const cid = customerIdOf(w);
      if (!cid) continue;
      const arr = timestampsByCustomer.get(cid) ?? [];
      arr.push(w.createdAt.getTime());
      timestampsByCustomer.set(cid, arr);
    }
    const contacts = await this.contacts.list(tenantId);

    const out: ChurnRisk[] = [];
    for (const c of contacts) {
      const stamps = timestampsByCustomer.get(c.id);
      if (!stamps || stamps.length === 0) continue;
      stamps.sort((a, b) => a - b);
      const lastJob = stamps[stamps.length - 1] ?? 0;
      const signals: ChurnSignals = {
        daysSinceLastJob: (now.getTime() - lastJob) / DAY_MS,
        jobCount: stamps.length,
        medianGapDays: medianGapDays(stamps),
      };
      const risk = scoreChurn(signals);
      if (risk.level === 'low') continue;
      out.push({
        ...risk,
        contactId: c.id,
        displayName: c.displayName,
        jobCount: stamps.length,
        lastActivityAt: new Date(lastJob).toISOString(),
        draftMessage: draftReengagementMessage(c.displayName),
      });
    }
    return out.sort((a, b) => b.score - a.score);
  }

  /** A deterministic activity recap for one customer. 404s (via contacts.get) for another tenant's id. */
  async contactSummary(tenantId: string, contactId: string): Promise<ActivitySummary> {
    const contact: ContactView = await this.contacts.get(tenantId, contactId);
    const items = (await this.workItems.list(tenantId)).filter(
      (w) => customerIdOf(w) === contactId,
    );

    const states: Record<string, number> = {};
    let lastActivity = 0;
    for (const w of items) {
      states[w.stateName] = (states[w.stateName] ?? 0) + 1;
      lastActivity = Math.max(lastActivity, w.createdAt.getTime());
    }

    const jobCount = items.length;
    const lastActivityAt = lastActivity ? new Date(lastActivity).toISOString() : null;
    const summary = buildSummary(contact.displayName, jobCount, states, lastActivity);

    return { contactId, displayName: contact.displayName, jobCount, lastActivityAt, states, summary };
  }
}

function buildSummary(
  name: string,
  jobCount: number,
  states: Record<string, number>,
  lastActivity: number,
): string {
  if (jobCount === 0) return `${name} has no recorded activity yet.`;
  const stateParts = Object.entries(states)
    .map(([s, n]) => `${n} ${s}`)
    .join(', ');
  const last = lastActivity ? new Date(lastActivity).toISOString().slice(0, 10) : 'unknown';
  const noun = jobCount === 1 ? 'job' : 'jobs';
  return `${name} has ${jobCount} ${noun} (${stateParts}); most recent activity ${last}.`;
}
