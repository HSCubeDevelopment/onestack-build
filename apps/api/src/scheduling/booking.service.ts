import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenantClient, TenantService } from '../tenancy/tenant.service';

export interface BookingView {
  id: string;
  resourceId: string;
  workItemId: string | null;
  title: string;
  startsAt: Date;
  endsAt: Date;
  notes: string | null;
}

export interface CreateBookingInput {
  resourceId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  workItemId?: string;
  notes?: string;
  allowOverlap?: boolean;
}

export interface UpdateBookingInput {
  resourceId?: string;
  title?: string;
  startsAt?: string;
  endsAt?: string;
  workItemId?: string | null;
  notes?: string | null;
  allowOverlap?: boolean;
}

/**
 * Bookings on the calendar (card #23). A booking reserves ONE resource for a time range. Double-booking
 * the same resource is PREVENTED (409) unless the caller passes `allowOverlap` (the UI's "book anyway"
 * after the clash warning). Move/resize is a plain update — the same overlap rule applies. Tenant-scoped.
 */
@Injectable()
export class BookingService {
  constructor(private readonly tenants: TenantService) {}

  async create(tenantId: string, input: CreateBookingInput): Promise<BookingView> {
    const startsAt = this.parseRange(input.startsAt, input.endsAt);
    if (!input.title?.trim()) throw new BadRequestException('title is required');
    const created = await this.tenants.runInTenant(tenantId, async (tx) => {
      const resource = await tx.resource.findFirst({
        where: { id: input.resourceId, deletedAt: null },
      });
      if (!resource) throw new NotFoundException('Resource not found');
      await this.assertLinkedJob(tx, input.workItemId);
      if (!input.allowOverlap)
        await this.assertNoOverlap(tx, input.resourceId, startsAt.startsAt, startsAt.endsAt, null);
      return tx.booking.create({
        data: {
          tenantId,
          resourceId: input.resourceId,
          workItemId: input.workItemId ?? null,
          title: input.title.trim(),
          startsAt: startsAt.startsAt,
          endsAt: startsAt.endsAt,
          notes: input.notes?.trim() || null,
        },
      });
    });
    return toBookingView(created);
  }

  /** Calendar range fetch — powers Day and Week views (any booking that intersects [from, to)). */
  async list(tenantId: string, from?: string, to?: string): Promise<BookingView[]> {
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    if (fromDate && Number.isNaN(fromDate.getTime()))
      throw new BadRequestException('Invalid "from" date');
    if (toDate && Number.isNaN(toDate.getTime()))
      throw new BadRequestException('Invalid "to" date');
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const rows = await tx.booking.findMany({
        where: {
          // Overlap the window: startsAt < to AND endsAt > from.
          ...(toDate ? { startsAt: { lt: toDate } } : {}),
          ...(fromDate ? { endsAt: { gt: fromDate } } : {}),
        },
        orderBy: { startsAt: 'asc' },
      });
      return rows.map(toBookingView);
    });
  }

  async get(tenantId: string, id: string): Promise<BookingView> {
    const b = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.booking.findFirst({ where: { id } }),
    );
    if (!b) throw new NotFoundException('Booking not found');
    return toBookingView(b);
  }

  /** Edit / move / resize. Re-checks the overlap rule for the resulting resource + time range. */
  async update(tenantId: string, id: string, input: UpdateBookingInput): Promise<BookingView> {
    const updated = await this.tenants.runInTenant(tenantId, async (tx) => {
      const current = await tx.booking.findFirst({ where: { id } });
      if (!current) throw new NotFoundException('Booking not found');

      const resourceId = input.resourceId ?? current.resourceId;
      const startsAt = input.startsAt ? new Date(input.startsAt) : current.startsAt;
      const endsAt = input.endsAt ? new Date(input.endsAt) : current.endsAt;
      if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()))
        throw new BadRequestException('Invalid start/end time');
      if (startsAt >= endsAt) throw new BadRequestException('startsAt must be before endsAt');

      if (input.resourceId && input.resourceId !== current.resourceId) {
        const resource = await tx.resource.findFirst({
          where: { id: input.resourceId, deletedAt: null },
        });
        if (!resource) throw new NotFoundException('Resource not found');
      }
      if (input.workItemId !== undefined) await this.assertLinkedJob(tx, input.workItemId);
      if (!input.allowOverlap) await this.assertNoOverlap(tx, resourceId, startsAt, endsAt, id);

      await tx.booking.update({
        where: { id },
        data: {
          resourceId,
          startsAt,
          endsAt,
          ...(input.title !== undefined ? { title: input.title.trim() } : {}),
          ...(input.workItemId !== undefined ? { workItemId: input.workItemId } : {}),
          ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
        },
      });
      return tx.booking.findFirst({ where: { id } });
    });
    return toBookingView(updated!);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.tenants.runInTenant(tenantId, async (tx) => {
      const res = await tx.booking.deleteMany({ where: { id } });
      if (res.count !== 1) throw new NotFoundException('Booking not found');
    });
  }

  private parseRange(from: string, to: string): { startsAt: Date; endsAt: Date } {
    const startsAt = new Date(from);
    const endsAt = new Date(to);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()))
      throw new BadRequestException('Invalid start/end time');
    if (startsAt >= endsAt) throw new BadRequestException('startsAt must be before endsAt');
    return { startsAt, endsAt };
  }

  private async assertLinkedJob(tx: TenantClient, workItemId?: string | null): Promise<void> {
    if (!workItemId) return;
    const wi = await tx.workItem.findFirst({ where: { id: workItemId, deletedAt: null } });
    if (!wi) throw new NotFoundException('Linked work item not found');
  }

  /** Two ranges clash iff startA < endB AND startB < endA. Excludes the booking being edited. */
  private async assertNoOverlap(
    tx: TenantClient,
    resourceId: string,
    startsAt: Date,
    endsAt: Date,
    excludeId: string | null,
  ): Promise<void> {
    const clash = await tx.booking.findFirst({
      where: {
        resourceId,
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (clash)
      throw new ConflictException(
        `That resource is already booked for an overlapping time ("${clash.title}")`,
      );
  }
}

function toBookingView(b: {
  id: string;
  resourceId: string;
  workItemId: string | null;
  title: string;
  startsAt: Date;
  endsAt: Date;
  notes: string | null;
}): BookingView {
  return {
    id: b.id,
    resourceId: b.resourceId,
    workItemId: b.workItemId,
    title: b.title,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    notes: b.notes,
  };
}
