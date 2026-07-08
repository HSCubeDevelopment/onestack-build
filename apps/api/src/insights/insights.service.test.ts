import { describe, expect, it } from 'vitest';
import { InsightsService } from './insights.service';

const NOW = new Date('2026-07-08T00:00:00Z');
const DAY = 1000 * 60 * 60 * 24;

// Minimal fakes shaped like the real services' return values.
function make(opts: {
  bookings?: unknown[];
  workItems?: unknown[];
  contacts?: unknown[];
  contactGet?: (id: string) => Promise<unknown>;
}) {
  const bookings = { list: async () => opts.bookings ?? [] };
  const workItems = { list: async () => opts.workItems ?? [] };
  const contacts = {
    list: async () => opts.contacts ?? [],
    get:
      opts.contactGet ??
      (async (_tenantId: string, id: string) => {
        const c = (opts.contacts ?? []).find((x) => (x as { id: string }).id === id);
        if (!c) throw new Error('not found');
        return c;
      }),
  };
  const svc = new InsightsService(bookings as never, workItems as never, contacts as never);
  svc.now = () => NOW;
  return svc;
}

const wi = (id: string, customerId: string, createdAt: Date, stateName = 'open') => ({
  id,
  type: 'job',
  reference: id,
  stateName,
  workflowVersion: 1,
  assignees: [],
  fields: { customerId },
  version: 1,
  createdAt,
});

describe('InsightsService.noShowRisk', () => {
  it('ranks upcoming bookings by risk and resolves the customer', async () => {
    const svc = make({
      bookings: [
        { id: 'bk1', resourceId: 'r', workItemId: 'w1', title: 'New cust', startsAt: new Date(NOW.getTime() + 20 * DAY), endsAt: NOW, notes: null },
        { id: 'bk2', resourceId: 'r', workItemId: 'w2', title: 'Regular', startsAt: new Date(NOW.getTime() + 3 * DAY), endsAt: NOW, notes: null },
      ],
      workItems: [
        wi('w1', 'c1', NOW), // c1: only this job → new customer
        wi('w2', 'c2', new Date(NOW.getTime() - 100 * DAY)),
        wi('w2b', 'c2', new Date(NOW.getTime() - 50 * DAY)), // c2 established
      ],
      contacts: [
        { id: 'c1', displayName: 'New', email: null, phone: null, fields: {}, customFields: {}, createdAt: NOW }, // unreachable
        { id: 'c2', displayName: 'Reg', email: 'r@x.com', phone: '040', fields: {}, customFields: {}, createdAt: NOW },
      ],
    });
    const risks = await svc.noShowRisk('t1');
    expect(risks).toHaveLength(2);
    // The new, unreachable, long-lead customer is riskiest and sorts first.
    expect(risks[0]?.bookingId).toBe('bk1');
    expect(risks[0]?.level).toBe('high');
    expect(risks[0]?.contactId).toBe('c1');
    expect(risks[1]?.level).toBe('low');
  });

  it('returns [] when there are no upcoming bookings', async () => {
    expect(await make({ bookings: [] }).noShowRisk('t1')).toEqual([]);
  });
});

describe('InsightsService.churnRisk', () => {
  it('includes overdue regulars with a draft message and omits low-risk', async () => {
    const svc = make({
      workItems: [
        wi('w1', 'c1', new Date(NOW.getTime() - 300 * DAY)),
        wi('w2', 'c1', new Date(NOW.getTime() - 390 * DAY)),
        wi('w3', 'c1', new Date(NOW.getTime() - 480 * DAY)), // ~90d cadence, 300d silent → overdue
        wi('w4', 'c2', new Date(NOW.getTime() - 10 * DAY)), // recent → low, omitted
      ],
      contacts: [
        { id: 'c1', displayName: 'Overdue Sam', email: null, phone: '040', fields: {}, customFields: {}, createdAt: NOW },
        { id: 'c2', displayName: 'Recent', email: null, phone: '040', fields: {}, customFields: {}, createdAt: NOW },
      ],
    });
    const risks = await svc.churnRisk('t1');
    expect(risks).toHaveLength(1);
    expect(risks[0]?.contactId).toBe('c1');
    expect(risks[0]?.level).not.toBe('low');
    expect(risks[0]?.draftMessage).toContain('Overdue Sam');
    expect(risks[0]?.jobCount).toBe(3);
  });
});

describe('InsightsService.contactSummary', () => {
  it('summarises a customer activity deterministically', async () => {
    const svc = make({
      contacts: [{ id: 'c1', displayName: 'Sam', email: null, phone: '040', fields: {}, customFields: {}, createdAt: NOW }],
      workItems: [
        wi('w1', 'c1', new Date(NOW.getTime() - 5 * DAY), 'open'),
        wi('w2', 'c1', new Date(NOW.getTime() - 40 * DAY), 'closed'),
        wi('w3', 'cOther', NOW, 'open'),
      ],
    });
    const s = await svc.contactSummary('t1', 'c1');
    expect(s.jobCount).toBe(2);
    expect(s.states).toEqual({ open: 1, closed: 1 });
    expect(s.summary).toContain('Sam has 2 jobs');
    expect(s.lastActivityAt).toBe(new Date(NOW.getTime() - 5 * DAY).toISOString());
  });

  it('propagates a 404 (other tenant / missing contact)', async () => {
    const svc = make({ contacts: [] });
    await expect(svc.contactSummary('t1', 'nope')).rejects.toThrow('not found');
  });
});
