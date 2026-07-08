import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { PortalService } from './portal.service';

// Fakes — no DB. A shared in-memory token store backs the tenant tx and the admin (token) prisma.
function make(opts?: {
  contact?: { id: string; displayName: string };
  jobs?: Array<{ id: string; reference: string; stateName: string; fields: Record<string, unknown> }>;
  quotes?: unknown[];
  invoices?: unknown[];
  documents?: unknown[];
  signatures?: unknown[];
  bookingPage?: { exists: boolean; enabled: boolean; publicToken: string | null };
  quoteStatus?: string;
}) {
  const contact = opts?.contact ?? { id: 'c1', displayName: 'Jane' };
  const access: Array<Record<string, unknown>> = [];

  const tx = {
    portalAccess: {
      findFirst: async ({ where }: { where: { contactId?: string; revokedAt: null } }) =>
        access.find((a) => a.contactId === where.contactId && a.revokedAt === null) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `pa${access.length + 1}`, revokedAt: null, ...data };
        access.push(row);
        return row;
      },
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        for (const a of access) if (a.revokedAt === null) Object.assign(a, data);
        return { count: access.length };
      },
    },
  };
  const tenants = { runInTenant: (_t: string, fn: (tx: unknown) => unknown) => fn(tx) };
  const prisma = {
    portalAccess: {
      findFirst: async ({ where }: { where: { token: string; revokedAt: null } }) =>
        access.find((a) => a.token === where.token && a.revokedAt === null) ?? null,
    },
  };
  const contacts = {
    get: async (_t: string, id: string) => {
      if (id !== contact.id) throw new NotFoundException('not found');
      return contact;
    },
  };
  const workItems = {
    list: async () => opts?.jobs ?? [],
    get: async (_t: string, id: string) => (opts?.jobs ?? []).find((j) => j.id === id) ?? null,
  };
  const quotes = {
    listForJob: async () => opts?.quotes ?? [],
    get: async (_t: string, id: string) => (opts?.quotes ?? []).find((q) => (q as { id: string }).id === id),
    setStatus: async (_t: string, _id: string, status: string) => ({ status }),
  };
  const invoices = { listForJob: async () => opts?.invoices ?? [] };
  const documents = { list: async () => opts?.documents ?? [] };
  const signatures = { listForDocument: async () => opts?.signatures ?? [] };
  const booking = {
    getConfig: async () => opts?.bookingPage ?? { exists: false, enabled: false, publicToken: null },
  };

  const svc = new PortalService(
    tenants as never,
    prisma as never,
    contacts as never,
    workItems as never,
    quotes as never,
    invoices as never,
    documents as never,
    signatures as never,
    booking as never,
  );
  return { svc, access };
}

const job = (id: string, ref: string, customerId: string, stateName = 'InProgress') => ({
  id,
  reference: ref,
  stateName,
  fields: { customerId },
});

describe('PortalService.issueLink', () => {
  it('creates a passwordless link and reuses it on the next call', async () => {
    const { svc } = make();
    const first = await svc.issueLink('t1', 'c1', 'u1');
    expect(first.portalUrl).toMatch(/^\/public\/portal\/[a-f0-9]+$/);
    const second = await svc.issueLink('t1', 'c1', 'u1');
    expect(second.portalUrl).toBe(first.portalUrl); // reused, not a new token
  });

  it('404s for another tenant contact', async () => {
    const { svc } = make();
    await expect(svc.issueLink('t1', 'other', 'u1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('PortalService.home', () => {
  it('shows only the token customer jobs, quotes, docs (with sign links) and read-only invoices', async () => {
    const { svc } = make({
      jobs: [job('j1', 'JOB-1', 'c1'), job('j2', 'JOB-2', 'cOther')],
      quotes: [{ id: 'q1', reference: 'Q-1', status: 'Sent', totalCents: 11000 }],
      invoices: [
        { reference: 'INV-1', status: 'Sent', totalCents: 11000, balanceCents: 11000 },
      ],
      documents: [{ id: 'd1', type: 'authority' }],
      signatures: [{ status: 'pending', signUrl: '/public/documents/sign/abc' }],
      bookingPage: { exists: true, enabled: true, publicToken: 'BOOKTOK' },
    });
    const link = await svc.issueLink('t1', 'c1', 'u1');
    const token = link.portalUrl.split('/').pop() as string;

    const home = await svc.home(token);
    expect(home.customer.name).toBe('Jane');
    expect(home.jobs).toEqual([{ reference: 'JOB-1', status: 'InProgress' }]); // j2 excluded
    expect(home.quotes[0]).toMatchObject({ reference: 'Q-1', totalCents: 11000 });
    expect(home.documents[0]).toEqual({ id: 'd1', type: 'authority', signUrl: '/public/documents/sign/abc' });
    expect(home.invoices[0]).toMatchObject({ balanceCents: 11000 });
    expect(home.payments.online).toBe(false);
    expect(home.bookingUrl).toBe('/public/booking/BOOKTOK');
  });

  it('404s an unknown/revoked token', async () => {
    const { svc } = make();
    await expect(svc.home('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('omits the booking link when the page is not enabled', async () => {
    const { svc } = make({ jobs: [], bookingPage: { exists: true, enabled: false, publicToken: 'X' } });
    const link = await svc.issueLink('t1', 'c1', 'u1');
    const token = link.portalUrl.split('/').pop() as string;
    expect((await svc.home(token)).bookingUrl).toBeNull();
  });
});

describe('PortalService.decideQuote', () => {
  it("accepts a quote on the customer's own job", async () => {
    const { svc } = make({
      jobs: [job('j1', 'JOB-1', 'c1')],
      quotes: [{ id: 'q1', reference: 'Q-1', status: 'Sent', totalCents: 100, workItemId: 'j1' }],
    });
    const link = await svc.issueLink('t1', 'c1', 'u1');
    const token = link.portalUrl.split('/').pop() as string;
    const res = await svc.decideQuote(token, 'q1', 'accept');
    expect(res.status).toBe('Accepted');
  });

  it("forbids deciding a quote on someone else's job", async () => {
    const { svc } = make({
      jobs: [job('j2', 'JOB-2', 'cOther')],
      quotes: [{ id: 'q2', reference: 'Q-2', status: 'Sent', totalCents: 100, workItemId: 'j2' }],
    });
    const link = await svc.issueLink('t1', 'c1', 'u1');
    const token = link.portalUrl.split('/').pop() as string;
    await expect(svc.decideQuote(token, 'q2', 'accept')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('PortalService.revoke', () => {
  it('revokes access so the token stops working', async () => {
    const { svc } = make({ jobs: [] });
    const link = await svc.issueLink('t1', 'c1', 'u1');
    const token = link.portalUrl.split('/').pop() as string;
    await svc.revoke('t1', 'c1');
    await expect(svc.home(token)).rejects.toBeInstanceOf(NotFoundException);
  });
});
