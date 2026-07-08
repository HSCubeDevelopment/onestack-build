// Unit tests for ReviewService with lightweight fakes (no DB). Covers the service methods directly:
// request, list, summary, setPublished, publicPage, and the public submit (+ its guards).
import { describe, expect, it } from 'vitest';
import { ContactsService } from '../contacts/contacts.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenancy/tenant.service';
import { WorkItemService } from '../work-items/work-item.service';
import { ReviewInviteSender } from './review-invite-sender';
import { ReviewService } from './review.service';

const ROW = {
  id: 'r1',
  workItemId: 'w1',
  contactId: null,
  token: 'tok',
  status: 'requested',
  source: 'web',
  reviewerName: null,
  rating: 5,
  comment: null,
  published: true,
  createdAt: new Date('2026-07-08T00:00:00.000Z'),
  submittedAt: null,
};

function makeService(opts: {
  resolved?: { id: string; tenantId: string; workItemId: string | null; status: string } | null;
}) {
  let updated: Record<string, unknown> | null = null;
  const tx = {
    review: {
      findFirst: async () => ({ ...ROW }),
      findMany: async () => [{ ...ROW, status: 'submitted' }],
      create: async ({ data }: { data: Record<string, unknown> }) => ({ ...ROW, ...data }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updated = data;
        return { ...ROW, ...data };
      },
    },
    workItem: { findFirst: async () => ({ reference: 'J-000001' }) },
  };
  const tenants = {
    runInTenant: async (_id: string, fn: (t: unknown) => Promise<unknown>) => fn(tx),
  } as unknown as TenantService;
  const prisma = {
    review: { findFirst: async () => opts.resolved ?? null },
  } as unknown as PrismaService;
  const contacts = { get: async () => ({}) } as unknown as ContactsService;
  const workItems = { get: async () => ({}) } as unknown as WorkItemService;
  const inviter = {
    send: async () => ({ sent: false, reason: 'no provider' }),
  } as unknown as ReviewInviteSender;
  const svc = new ReviewService(tenants, prisma, contacts, workItems, inviter);
  return {
    svc,
    get updated() {
      return updated;
    },
  };
}

describe('ReviewService', () => {
  it('request creates a review and tries the (no-op) invite', async () => {
    const { svc } = makeService({});
    const { review, invite } = await svc.request('t', 'w1', undefined, 'u1');
    expect(review.status).toBe('requested');
    expect(invite.sent).toBe(false);
  });

  it('list + summary read the reviews', async () => {
    const { svc } = makeService({});
    expect(await svc.list('t')).toHaveLength(1);
    const s = await svc.summary('t');
    expect(s.count).toBe(1);
    expect(s.average).toBe(5);
  });

  it('setPublished updates the flag', async () => {
    const h = makeService({});
    const view = await h.svc.setPublished('t', 'r1', false);
    expect(view.published).toBe(false);
    expect(h.updated).toEqual({ published: false });
  });

  it('publicPage resolves the token and returns the job reference', async () => {
    const { svc } = makeService({
      resolved: { id: 'r1', tenantId: 't', workItemId: 'w1', status: 'requested' },
    });
    const page = await svc.publicPage('tok');
    expect(page.status).toBe('requested');
    expect(page.jobReference).toBe('J-000001');
  });

  it('submit marks the review submitted; guards bad rating, unknown token, re-submit', async () => {
    const h = makeService({
      resolved: { id: 'r1', tenantId: 't', workItemId: null, status: 'requested' },
    });
    expect(await h.svc.submit('tok', { rating: 4, comment: 'ok' })).toEqual({ thanks: true });
    expect(h.updated).toMatchObject({ status: 'submitted', rating: 4 });

    await expect(
      makeService({
        resolved: { id: 'r1', tenantId: 't', workItemId: null, status: 'requested' },
      }).svc.submit('tok', { rating: 9 }),
    ).rejects.toThrow(/1 to 5/);
    await expect(makeService({ resolved: null }).svc.submit('tok', { rating: 4 })).rejects.toThrow(
      /not found/i,
    );
    await expect(
      makeService({
        resolved: { id: 'r1', tenantId: 't', workItemId: null, status: 'submitted' },
      }).svc.submit('tok', { rating: 4 }),
    ).rejects.toThrow(/already been submitted/i);
  });
});
