import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantService } from '../tenancy/tenant.service';
import { ContactView } from './contacts.service';
import { DuplicateGroup, findDuplicates } from './duplicates';

export interface MergeResult {
  primary: ContactView;
  reassigned: {
    workItems: number;
    vehicles: number;
    invoices: number;
    invoicePortions: number;
    leads: number;
    tags: number;
    portalAccess: number;
    intakeSubmissions: number;
    reviews: number;
    assistantMessages: number;
  };
}

/**
 * Duplicate detection & merge (Phase 4, card #200). Detection is READ-ONLY. Merge is a DESTRUCTIVE, PII
 * operation, so it is deliberately conservative and atomic: within ONE tenant transaction it repoints every
 * reference to the duplicate onto the primary, copies any scalar fields the primary is missing, then
 * SOFT-deletes the duplicate and stamps `fields.mergedIntoId` (an audit + reversibility marker — no data is
 * hard-deleted). Because a merge must repoint records owned by several modules, this crosses module
 * boundaries on purpose (atomicity beats eventual consistency for a destructive op) — hence flagged for
 * human/senior review. Tenant-scoped throughout.
 */
@Injectable()
export class ContactMergeService {
  constructor(private readonly tenants: TenantService) {}

  /** READ-ONLY: candidate duplicate groups for this tenant (shared phone / email / name). */
  async duplicates(tenantId: string): Promise<DuplicateGroup[]> {
    const rows = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.contact.findMany({
        where: { deletedAt: null },
        select: { id: true, displayName: true, email: true, phone: true },
        orderBy: { createdAt: 'asc' },
      }),
    );
    return findDuplicates(rows);
  }

  /** Merge `duplicateId` into `primaryId`. Atomic + reversible (soft-delete). See class doc. */
  async merge(
    tenantId: string,
    primaryId: string,
    duplicateId: string,
    userId: string,
  ): Promise<MergeResult> {
    if (primaryId === duplicateId)
      throw new BadRequestException('Cannot merge a contact into itself');

    return this.tenants.runInTenant(tenantId, async (tx) => {
      const primary = await tx.contact.findFirst({ where: { id: primaryId, deletedAt: null } });
      const dup = await tx.contact.findFirst({ where: { id: duplicateId, deletedAt: null } });
      if (!primary || !dup)
        throw new NotFoundException('Both contacts must exist and not be already merged');

      // 1) Repoint scalar-FK references (no unique conflicts on these).
      const [
        vehicles,
        invoices,
        invoicePortions,
        leads,
        portalAccess,
        intakeSubmissions,
        reviews,
        assistantMessages,
      ] = await Promise.all([
        tx.subject.updateMany({
          where: { contactId: duplicateId },
          data: { contactId: primaryId },
        }),
        tx.invoice.updateMany({
          where: { payerContactId: duplicateId },
          data: { payerContactId: primaryId },
        }),
        tx.invoicePortion.updateMany({
          where: { payerContactId: duplicateId },
          data: { payerContactId: primaryId },
        }),
        tx.lead.updateMany({
          where: { convertedContactId: duplicateId },
          data: { convertedContactId: primaryId },
        }),
        tx.portalAccess.updateMany({
          where: { contactId: duplicateId },
          data: { contactId: primaryId },
        }),
        tx.intakeSubmission.updateMany({
          where: { contactId: duplicateId },
          data: { contactId: primaryId },
        }),
        tx.review.updateMany({ where: { contactId: duplicateId }, data: { contactId: primaryId } }),
        tx.assistantMessage.updateMany({
          where: { contactId: duplicateId },
          data: { contactId: primaryId },
        }),
      ]);

      // 2) Tags carry a unique (tenantId, tagId, contactId): drop the duplicate's tags the primary already
      //    has, then repoint the rest.
      const primaryTags = await tx.contactTag.findMany({
        where: { contactId: primaryId },
        select: { tagId: true },
      });
      const primaryTagIds = primaryTags.map((t) => t.tagId);
      if (primaryTagIds.length)
        await tx.contactTag.deleteMany({
          where: { contactId: duplicateId, tagId: { in: primaryTagIds } },
        });
      const tags = await tx.contactTag.updateMany({
        where: { contactId: duplicateId },
        data: { contactId: primaryId },
      });

      // 3) Work items reference the customer by JSON `fields.customerId` (no FK) — repoint each.
      const jobs = await tx.workItem.findMany({
        where: { fields: { path: ['customerId'], equals: duplicateId } },
        select: { id: true, fields: true },
      });
      for (const j of jobs) {
        const fields = { ...(j.fields as Record<string, unknown>), customerId: primaryId };
        await tx.workItem.update({
          where: { id: j.id },
          data: { fields: fields as Prisma.InputJsonValue },
        });
      }

      // 4) Fill scalar gaps on the primary from the duplicate (primary always wins where it has a value).
      const patch: Prisma.ContactUpdateManyMutationInput = {};
      if (!primary.email && dup.email) patch.email = dup.email;
      if (!primary.phone && dup.phone) patch.phone = dup.phone;
      const mergedFields = {
        ...(dup.fields as Record<string, unknown>),
        ...(primary.fields as Record<string, unknown>),
      };
      patch.fields = mergedFields as Prisma.InputJsonValue;
      if (Object.keys(patch).length)
        await tx.contact.updateMany({ where: { id: primaryId }, data: patch });

      // 5) Soft-delete the duplicate with an audit/reversibility marker.
      const dupFields = {
        ...(dup.fields as Record<string, unknown>),
        mergedIntoId: primaryId,
        mergedByUserId: userId,
      };
      await tx.contact.updateMany({
        where: { id: duplicateId },
        data: { deletedAt: new Date(), fields: dupFields as Prisma.InputJsonValue },
      });

      const updated = await tx.contact.findFirst({ where: { id: primaryId } });
      return {
        primary: toView(updated!),
        reassigned: {
          workItems: jobs.length,
          vehicles: vehicles.count,
          invoices: invoices.count,
          invoicePortions: invoicePortions.count,
          leads: leads.count,
          tags: tags.count,
          portalAccess: portalAccess.count,
          intakeSubmissions: intakeSubmissions.count,
          reviews: reviews.count,
          assistantMessages: assistantMessages.count,
        },
      };
    });
  }
}

function toView(c: {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  fields: unknown;
  customFields: unknown;
  createdAt: Date;
}): ContactView {
  return {
    id: c.id,
    displayName: c.displayName,
    email: c.email,
    phone: c.phone,
    fields: (c.fields as Record<string, unknown>) ?? {},
    customFields: (c.customFields as Record<string, unknown>) ?? {},
    createdAt: c.createdAt,
  };
}
