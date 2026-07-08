import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ContactsService } from '../contacts/contacts.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenancy/tenant.service';
import { WorkItemService } from '../work-items/work-item.service';
import { ReputationSummary, summariseReputation, validateRating } from './review';
import { InviteResult, REVIEW_INVITE_SENDER, ReviewInviteSender } from './review-invite-sender';

export interface ReviewView {
  id: string;
  workItemId: string | null;
  contactId: string | null;
  token: string;
  status: 'requested' | 'submitted';
  source: string;
  reviewerName: string | null;
  rating: number | null;
  comment: string | null;
  published: boolean;
  createdAt: string;
  submittedAt: string | null;
}

export interface PublicReviewPage {
  status: 'requested' | 'submitted';
  jobReference: string | null;
}

/**
 * Reviews & reputation (Phase 3). Request a review from a customer after a job (a tokenised link), let
 * them submit a star rating + comment publicly, and aggregate it into a reputation summary. Emailing the
 * invite is a vendor boundary (no-op until a provider is wired). Owner reads are tenant-scoped via the
 * wrapper; the public submit resolves the unguessable token through the BYPASSRLS admin connection, then
 * writes through the tenant wrapper — the same pattern as public lead capture. External reviews deferred.
 */
@Injectable()
export class ReviewService {
  constructor(
    private readonly tenants: TenantService,
    private readonly prisma: PrismaService,
    private readonly contacts: ContactsService,
    private readonly workItems: WorkItemService,
    @Inject(REVIEW_INVITE_SENDER) private readonly inviter: ReviewInviteSender,
  ) {}

  /** Request a review for a job/customer — creates a tokenised link and (vendor boundary) tries to send it. */
  async request(
    tenantId: string,
    jobId: string,
    contactId: string | undefined,
    userId: string,
  ): Promise<{ review: ReviewView; invite: InviteResult }> {
    await this.workItems.get(tenantId, jobId); // 404s for a missing/other-tenant job
    if (contactId) await this.contacts.get(tenantId, contactId);

    const review = await this.tenants.runInTenant(tenantId, async (tx) => {
      const row = await tx.review.create({
        data: {
          tenantId,
          workItemId: jobId,
          contactId: contactId ?? null,
          token: randomUUID().replace(/-/g, ''),
          status: 'requested',
          requestedByUserId: userId,
        },
      });
      return toView(row);
    });
    const invite = await this.inviter.send({
      reviewId: review.id,
      token: review.token,
      contactId: review.contactId,
    });
    return { review, invite };
  }

  async list(tenantId: string): Promise<ReviewView[]> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const rows = await tx.review.findMany({ orderBy: { createdAt: 'desc' } });
      return rows.map(toView);
    });
  }

  /** Reputation summary over SUBMITTED, published reviews. */
  async summary(tenantId: string): Promise<ReputationSummary> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const rows = await tx.review.findMany({
        where: { status: 'submitted', published: true, rating: { not: null } },
      });
      return summariseReputation(rows.map((r) => ({ rating: r.rating as number })));
    });
  }

  /** Show or hide a submitted review from public display. */
  async setPublished(tenantId: string, id: string, published: boolean): Promise<ReviewView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const row = await tx.review.findFirst({ where: { id } });
      if (!row) throw new NotFoundException('Review not found');
      const updated = await tx.review.update({ where: { id }, data: { published } });
      return toView(updated);
    });
  }

  // ---- public (token-keyed, no auth) ----

  async publicPage(token: string): Promise<PublicReviewPage> {
    const review = await this.resolve(token);
    const job = review.workItemId
      ? await this.tenants.runInTenant(review.tenantId, (tx) =>
          tx.workItem.findFirst({ where: { id: review.workItemId as string } }),
        )
      : null;
    return {
      status: review.status as 'requested' | 'submitted',
      jobReference: job?.reference ?? null,
    };
  }

  async submit(
    token: string,
    input: { rating: number; comment?: string; reviewerName?: string },
  ): Promise<{ thanks: true }> {
    const rating = validateRating(input.rating, (m) => new BadRequestException(m));
    const review = await this.resolve(token);
    if (review.status === 'submitted')
      throw new ConflictException('This review has already been submitted');
    await this.tenants.runInTenant(review.tenantId, (tx) =>
      tx.review.update({
        where: { id: review.id },
        data: {
          status: 'submitted',
          rating,
          comment: input.comment?.trim() || null,
          reviewerName: input.reviewerName?.trim() || null,
          submittedAt: new Date(),
        },
      }),
    );
    return { thanks: true };
  }

  private async resolve(token: string): Promise<{
    id: string;
    tenantId: string;
    workItemId: string | null;
    status: string;
  }> {
    const review = await this.prisma.review.findFirst({
      where: { token },
      select: { id: true, tenantId: true, workItemId: true, status: true },
    });
    if (!review) throw new NotFoundException('Review link not found');
    return review;
  }
}

function toView(row: {
  id: string;
  workItemId: string | null;
  contactId: string | null;
  token: string;
  status: string;
  source: string;
  reviewerName: string | null;
  rating: number | null;
  comment: string | null;
  published: boolean;
  createdAt: Date;
  submittedAt: Date | null;
}): ReviewView {
  return {
    id: row.id,
    workItemId: row.workItemId,
    contactId: row.contactId,
    token: row.token,
    status: row.status as 'requested' | 'submitted',
    source: row.source,
    reviewerName: row.reviewerName,
    rating: row.rating,
    comment: row.comment,
    published: row.published,
    createdAt: row.createdAt.toISOString(),
    submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
  };
}
