import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingService } from '../scheduling/booking.service';
import { TenantService } from '../tenancy/tenant.service';

export interface WaitlistView {
  id: string;
  contactId: string | null;
  name: string;
  phone: string;
  resourceId: string | null;
  notes: string | null;
  status: 'waiting' | 'booked' | 'removed';
  bookingId: string | null;
  createdAt: string;
}

export interface AddWaitlistInput {
  name: string;
  phone: string;
  contactId?: string;
  resourceId?: string;
  notes?: string;
}

export interface FillInput {
  resourceId: string;
  startsAt: string;
  endsAt: string;
  title?: string;
}

/**
 * Waitlist & auto-fill (Phase 4, card #210). GENERIC core (Scheduling & Ops). Holds customers waiting for a
 * slot so a cancellation can be filled to protect utilisation. Auto-fill SURFACES matching waiting entries
 * for a freed slot; the owner CONFIRMS the fill into a booking (we never auto-book a customer without
 * confirmation — an outward action). Reuses the scheduling module's overlap-checked booking create.
 * Tenant-scoped throughout.
 */
@Injectable()
export class WaitlistService {
  constructor(
    private readonly tenants: TenantService,
    private readonly bookings: BookingService,
  ) {}

  async add(tenantId: string, input: AddWaitlistInput): Promise<WaitlistView> {
    const name = input.name?.trim();
    const phone = input.phone?.trim();
    if (!name || !phone) throw new BadRequestException('name and phone are required');
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const row = await tx.waitlistEntry.create({
        data: {
          tenantId,
          name,
          phone,
          contactId: input.contactId ?? null,
          resourceId: input.resourceId ?? null,
          notes: input.notes?.trim() || null,
        },
      });
      return toView(row);
    });
  }

  /** Waiting entries (optionally only those with no preference or a preference for `resourceId`). */
  async candidates(tenantId: string, resourceId?: string): Promise<WaitlistView[]> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const rows = await tx.waitlistEntry.findMany({
        where: {
          status: 'waiting',
          ...(resourceId ? { OR: [{ resourceId: null }, { resourceId }] } : {}),
        },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(toView);
    });
  }

  async list(tenantId: string): Promise<WaitlistView[]> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const rows = await tx.waitlistEntry.findMany({
        where: { status: 'waiting' },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(toView);
    });
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.tenants.runInTenant(tenantId, (tx) =>
      tx.waitlistEntry.updateMany({
        where: { id, status: 'waiting' },
        data: { status: 'removed' },
      }),
    );
  }

  /** Confirm a waiting entry into a booking (the "fill"). Marks the entry booked. */
  async fill(tenantId: string, id: string, input: FillInput): Promise<WaitlistView> {
    const entry = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.waitlistEntry.findFirst({ where: { id } }),
    );
    if (!entry) throw new NotFoundException('Waitlist entry not found');
    if (entry.status !== 'waiting')
      throw new BadRequestException(`This entry is already ${entry.status}`);

    const booking = await this.bookings.create(tenantId, {
      resourceId: input.resourceId,
      title: input.title?.trim() || `Waitlist: ${entry.name}`,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      notes: entry.notes ?? undefined,
    });

    return this.tenants.runInTenant(tenantId, async (tx) => {
      const row = await tx.waitlistEntry.update({
        where: { id },
        data: { status: 'booked', bookingId: booking.id },
      });
      return toView(row);
    });
  }
}

function toView(r: {
  id: string;
  contactId: string | null;
  name: string;
  phone: string;
  resourceId: string | null;
  notes: string | null;
  status: string;
  bookingId: string | null;
  createdAt: Date;
}): WaitlistView {
  return {
    id: r.id,
    contactId: r.contactId,
    name: r.name,
    phone: r.phone,
    resourceId: r.resourceId,
    notes: r.notes,
    status: r.status as WaitlistView['status'],
    bookingId: r.bookingId,
    createdAt: r.createdAt.toISOString(),
  };
}
