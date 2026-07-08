import { BadRequestException, Injectable } from '@nestjs/common';
import { TenantService } from '../tenancy/tenant.service';

export interface BrandView {
  businessName: string;
  tagline: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  websiteUrl: string | null;
  addressText: string | null;
}

export interface UpsertBrandInput {
  businessName?: string;
  tagline?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  websiteUrl?: string | null;
  addressText?: string | null;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Brand profile (Phase 3, card #151). A reusable per-tenant brand — business name, logo, colour, contact
 * details — that customer-facing surfaces render under (the public booking page, and any future public
 * page). GENERIC core. One row per tenant, upserted by the owner. Tenant-scoped; other modules read it
 * through this service (never its table). Payments are out of scope (deferred).
 */
@Injectable()
export class BrandingService {
  constructor(private readonly tenants: TenantService) {}

  /** The tenant's brand, or a sensible default when it hasn't been set up yet. */
  async get(tenantId: string): Promise<BrandView> {
    const row = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.brand.findFirst({ where: { tenantId } }),
    );
    return row ? toView(row) : defaultBrand();
  }

  /** Create or update the tenant's brand. */
  async upsert(tenantId: string, input: UpsertBrandInput): Promise<BrandView> {
    if (input.primaryColor && !HEX_COLOR.test(input.primaryColor))
      throw new BadRequestException('primaryColor must be a hex colour like #1a2b3c');

    return this.tenants.runInTenant(tenantId, async (tx) => {
      const existing = await tx.brand.findFirst({ where: { tenantId } });
      const businessName = (input.businessName ?? existing?.businessName)?.trim();
      if (!businessName) throw new BadRequestException('businessName is required');

      const data = {
        businessName,
        tagline: clean(input.tagline, existing?.tagline),
        logoUrl: clean(input.logoUrl, existing?.logoUrl),
        primaryColor: clean(input.primaryColor, existing?.primaryColor),
        contactPhone: clean(input.contactPhone, existing?.contactPhone),
        contactEmail: clean(input.contactEmail, existing?.contactEmail),
        websiteUrl: clean(input.websiteUrl, existing?.websiteUrl),
        addressText: clean(input.addressText, existing?.addressText),
      };
      const row = existing
        ? await tx.brand.update({ where: { id: existing.id }, data })
        : await tx.brand.create({ data: { tenantId, ...data } });
      return toView(row);
    });
  }
}

/** Undefined leaves the field unchanged; null or '' clears it; a value sets it. */
function clean(next: string | null | undefined, current: string | null | undefined): string | null {
  if (next === undefined) return current ?? null;
  const trimmed = next?.trim();
  return trimmed ? trimmed : null;
}

function defaultBrand(): BrandView {
  return {
    businessName: 'Book online',
    tagline: null,
    logoUrl: null,
    primaryColor: null,
    contactPhone: null,
    contactEmail: null,
    websiteUrl: null,
    addressText: null,
  };
}

function toView(r: {
  businessName: string;
  tagline: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  websiteUrl: string | null;
  addressText: string | null;
}): BrandView {
  return {
    businessName: r.businessName,
    tagline: r.tagline,
    logoUrl: r.logoUrl,
    primaryColor: r.primaryColor,
    contactPhone: r.contactPhone,
    contactEmail: r.contactEmail,
    websiteUrl: r.websiteUrl,
    addressText: r.addressText,
  };
}
