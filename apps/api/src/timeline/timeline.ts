/**
 * Pure customer-timeline assembly (Phase 3). No DB — cheap to unit test. Turns a customer's jobs and
 * their notes into a single chronological activity feed (newest first). Jobs carry their state + a
 * quote/invoice money summary; notes carry the text + author.
 */

export type TimelineEventType = 'job' | 'note';

export interface TimelineEvent {
  type: TimelineEventType;
  at: string; // ISO 8601
  jobId: string;
  jobReference: string;
  summary: string;
  authorUserId: string | null;
  amountsCents: { quotes: number; invoices: number; paid: number } | null;
}

export interface JobInput {
  id: string;
  reference: string;
  stateName: string;
  createdAt: Date;
  quoteCount: number;
  quoteTotalCents: number;
  invoiceCount: number;
  invoiceTotalCents: number;
  invoicePaidCents: number;
}

export interface NoteInput {
  jobId: string;
  jobReference: string;
  body: string;
  authorUserId: string;
  createdAt: Date;
}

/** Build the merged, newest-first event feed from a customer's jobs and their notes. */
export function buildTimeline(jobs: JobInput[], notes: NoteInput[]): TimelineEvent[] {
  const jobEvents: TimelineEvent[] = jobs.map((j) => ({
    type: 'job',
    at: j.createdAt.toISOString(),
    jobId: j.id,
    jobReference: j.reference,
    summary: `Job ${j.reference} — ${j.stateName} · ${j.quoteCount} quote(s), ${j.invoiceCount} invoice(s)`,
    authorUserId: null,
    amountsCents: {
      quotes: j.quoteTotalCents,
      invoices: j.invoiceTotalCents,
      paid: j.invoicePaidCents,
    },
  }));
  const noteEvents: TimelineEvent[] = notes.map((n) => ({
    type: 'note',
    at: n.createdAt.toISOString(),
    jobId: n.jobId,
    jobReference: n.jobReference,
    summary: n.body,
    authorUserId: n.authorUserId,
    amountsCents: null,
  }));
  return [...jobEvents, ...noteEvents].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
