import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { BrandingService, BrandView } from '../branding/branding.service';
import { ContactsService } from '../contacts/contacts.service';
import { PrismaService } from '../prisma/prisma.service';
import { BookingService } from '../scheduling/booking.service';
import { ResourceService } from '../scheduling/resource.service';
import { TenantService } from '../tenancy/tenant.service';
import { resolveSlot, validateSlotMinutes } from './online-booking';

export interface BookingPageView {
  exists: boolean;
  name: string;
  enabled: boolean;
  slotMinutes: number;
  resourceIds: string[];
  publicToken: string | null;
}

export interface PublicBookingPage {
  name: string;
  slotMinutes: number;
  resources: { id: string; name: string }[];
  /** The shop's brand, so the public page renders under it (card #151). */
  brand: BrandView;
}

export interface UpsertBookingPageInput {
  name?: string;
  enabled?: boolean;
  slotMinutes?: number;
  resourceIds?: string[];
}

export interface PublicBookInput {
  resourceId: string;
  startsAt: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  notes?: string;
  /** Honeypot — a bot fills this hidden field. */
  website?: string;
}

/**
 * Online booking (Phase 3). A per-tenant public self-service booking page: the shop configures which
 * resources are bookable + a default slot length; a customer books a free slot 24/7, which creates a
 * contact + a booking through the scheduling module's overlap-checked create. Deposits (payments) and
 * Google/social channels are DEFERRED (not built). Owner config is tenant-scoped via the wrapper; the
 * public path resolves the unguessable token through the BYPASSRLS admin connection (no tenant context
 * yet), then writes through the tenant wrapper — the same pattern as public lead capture.
 */
@Injectable()
export class OnlineBookingService {
  constructor(
    private readonly tenants: TenantService,
    private readonly prisma: PrismaService,
    private readonly contacts: ContactsService,
    private readonly resources: ResourceService,
    private readonly bookings: BookingService,
    private readonly branding: BrandingService,
  ) {}

  /** The shop's booking-page config (or a default if none has been set up). */
  async getConfig(tenantId: string): Promise<BookingPageView> {
    const page = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.bookingPage.findFirst({ where: { tenantId } }),
    );
    if (!page) {
      return {
        exists: false,
        name: 'Book online',
        enabled: false,
        slotMinutes: 60,
        resourceIds: [],
        publicToken: null,
      };
    }
    return toView(page);
  }

  /** Create or update the shop's booking page. Validates the slot length + that the resources exist. */
  async upsertConfig(tenantId: string, input: UpsertBookingPageInput): Promise<BookingPageView> {
    const slotMinutes =
      input.slotMinutes !== undefined
        ? validateSlotMinutes(input.slotMinutes, (m) => new BadRequestException(m))
        : undefined;
    const resourceIds = input.resourceIds;
    if (resourceIds !== undefined) {
      for (const id of resourceIds) await this.resources.get(tenantId, id); // 404s if not a real resource
    }
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const existing = await tx.bookingPage.findFirst({ where: { tenantId } });
      if (!existing) {
        const created = await tx.bookingPage.create({
          data: {
            tenantId,
            publicToken: randomUUID().replace(/-/g, ''),
            name: input.name?.trim() || 'Book online',
            enabled: input.enabled ?? false,
            slotMinutes: slotMinutes ?? 60,
            resourceIds: (resourceIds ?? []) as unknown as object,
          },
        });
        return toView(created);
      }
      const updated = await tx.bookingPage.update({
        where: { tenantId },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() || 'Book online' } : {}),
          ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
          ...(slotMinutes !== undefined ? { slotMinutes } : {}),
          ...(resourceIds !== undefined ? { resourceIds: resourceIds as unknown as object } : {}),
        },
      });
      return toView(updated);
    });
  }

  /** Regenerate the public token (invalidates the old link). */
  async regenerateToken(tenantId: string): Promise<BookingPageView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const page = await tx.bookingPage.findFirst({ where: { tenantId } });
      if (!page) throw new NotFoundException('Set up the booking page first');
      const updated = await tx.bookingPage.update({
        where: { tenantId },
        data: { publicToken: randomUUID().replace(/-/g, '') },
      });
      return toView(updated);
    });
  }

  // ---- public (token-keyed, no auth) ----

  /** The public booking page for a token — the bookable resources + slot length. */
  async publicPage(token: string): Promise<PublicBookingPage> {
    const page = await this.resolve(token);
    const names = await this.tenants.runInTenant(page.tenantId, (tx) =>
      tx.resource.findMany({ where: { deletedAt: null } }),
    );
    const byId = new Map(names.map((r) => [r.id, r.name]));
    const ids = page.resourceIds as string[];
    const brand = await this.branding.get(page.tenantId);
    return {
      name: page.name,
      slotMinutes: page.slotMinutes,
      resources: ids
        .filter((id) => byId.has(id))
        .map((id) => ({ id, name: byId.get(id) as string })),
      brand,
    };
  }

  /** Book a free slot from the public page — creates a contact + a booking. Deposits are deferred. */
  async publicBook(
    token: string,
    input: PublicBookInput,
  ): Promise<{ confirmed: boolean; bookingId: string; startsAt: string; endsAt: string }> {
    // Honeypot: a bot fills the hidden `website` field. Accept but do nothing observable.
    if (input.website && input.website.trim().length > 0) {
      return { confirmed: true, bookingId: '', startsAt: '', endsAt: '' };
    }
    const name = input.customerName?.trim();
    const phone = input.customerPhone?.trim();
    if (!name || !phone) throw new BadRequestException('Name and phone are required');

    const page = await this.resolve(token);
    const bookable = (page.resourceIds as string[]).includes(input.resourceId);
    if (!bookable) throw new BadRequestException('That resource is not bookable');

    const slot = resolveSlot(
      input.startsAt,
      page.slotMinutes,
      Date.now(),
      (m) => new BadRequestException(m),
    );

    // Create the customer, then the booking (overlap-checked by the scheduling module → 409 if taken).
    const contact = await this.contacts.create(page.tenantId, {
      displayName: name,
      phone,
      email: input.customerEmail?.trim() || undefined,
    });
    const booking = await this.bookings.create(page.tenantId, {
      resourceId: input.resourceId,
      title: `Online booking — ${name}`,
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
      notes: input.notes?.trim() || `Booked online by ${name} (${phone}); contact ${contact.id}`,
    });
    return {
      confirmed: true,
      bookingId: booking.id,
      startsAt: booking.startsAt.toISOString(),
      endsAt: booking.endsAt.toISOString(),
    };
  }

  /** Resolve a public token → its (enabled) booking page via the BYPASSRLS admin connection. */
  private async resolve(token: string): Promise<{
    tenantId: string;
    name: string;
    slotMinutes: number;
    resourceIds: unknown;
  }> {
    const page = await this.prisma.bookingPage.findFirst({
      where: { publicToken: token, enabled: true },
      select: { tenantId: true, name: true, slotMinutes: true, resourceIds: true },
    });
    if (!page) throw new NotFoundException('Booking page not found');
    return page;
  }
}

function toView(row: {
  name: string;
  enabled: boolean;
  slotMinutes: number;
  resourceIds: unknown;
  publicToken: string;
}): BookingPageView {
  return {
    exists: true,
    name: row.name,
    enabled: row.enabled,
    slotMinutes: row.slotMinutes,
    resourceIds: (Array.isArray(row.resourceIds) ? row.resourceIds : []) as string[],
    publicToken: row.publicToken,
  };
}
