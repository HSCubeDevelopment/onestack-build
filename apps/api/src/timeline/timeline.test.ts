// Unit tests for the pure customer-timeline assembly (Phase 3). No DB.
import { describe, expect, it } from 'vitest';
import { buildTimeline, JobInput, NoteInput } from './timeline';

const job = (over: Partial<JobInput> = {}): JobInput => ({
  id: 'j1',
  reference: 'J-000001',
  stateName: 'InProgress',
  createdAt: new Date('2026-07-01T09:00:00.000Z'),
  quoteCount: 1,
  quoteTotalCents: 12000,
  invoiceCount: 0,
  invoiceTotalCents: 0,
  invoicePaidCents: 0,
  ...over,
});

const note = (over: Partial<NoteInput> = {}): NoteInput => ({
  jobId: 'j1',
  jobReference: 'J-000001',
  body: 'Dropped off',
  authorUserId: 'u1',
  createdAt: new Date('2026-07-02T10:00:00.000Z'),
  ...over,
});

describe('buildTimeline', () => {
  it('merges jobs and notes newest-first', () => {
    const events = buildTimeline(
      [
        job(),
        job({ id: 'j2', reference: 'J-000002', createdAt: new Date('2026-07-03T09:00:00.000Z') }),
      ],
      [note()],
    );
    expect(events.map((e) => e.at)).toEqual([
      '2026-07-03T09:00:00.000Z', // job j2 (newest)
      '2026-07-02T10:00:00.000Z', // note
      '2026-07-01T09:00:00.000Z', // job j1
    ]);
  });

  it('shapes a job event with state and money summary', () => {
    const e = buildTimeline(
      [job({ invoiceCount: 1, invoiceTotalCents: 12000, invoicePaidCents: 6000 })],
      [],
    )[0]!;
    expect(e.type).toBe('job');
    expect(e.summary).toContain('InProgress');
    expect(e.amountsCents).toEqual({ quotes: 12000, invoices: 12000, paid: 6000 });
    expect(e.authorUserId).toBeNull();
  });

  it('shapes a note event with body and author', () => {
    const e = buildTimeline([], [note({ body: 'Called customer' })])[0]!;
    expect(e.type).toBe('note');
    expect(e.summary).toBe('Called customer');
    expect(e.authorUserId).toBe('u1');
    expect(e.amountsCents).toBeNull();
  });

  it('is empty when the customer has no jobs or notes', () => {
    expect(buildTimeline([], [])).toEqual([]);
  });
});
