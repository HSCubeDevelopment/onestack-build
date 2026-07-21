import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { TenantService } from '../tenancy/tenant.service';
import { CreateSiteDto, UpdateSiteDto } from './dto/sites.dto';

export interface SiteView {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  createdAt: string;
}

/**
 * Multi-site (SITE-1). A shop's physical locations/branches. A job optionally belongs to a site so an
 * owner running more than one location can see and filter work per branch. GENERIC core (Scheduling &
 * Ops) — a site is a business location, not a vertical noun. This module OWNS `onestack_site`; other
 * modules (work-items, dashboard) reach it only through this service, never its table. Every query is
 * tenant-scoped through `runInTenant`, so `assertInTenant` naturally rejects another tenant's site id.
 */
@Injectable()
export class SitesService {
  constructor(
    private readonly tenants: TenantService,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string): Promise<SiteView[]> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const rows = await tx.site.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } });
      return rows.map(toView);
    });
  }

  async create(tenantId: string, userId: string, dto: CreateSiteDto): Promise<SiteView> {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Site name is required');
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const existing = await tx.site.findFirst({ where: { name, deletedAt: null } });
      if (existing) throw new BadRequestException(`A site named "${name}" already exists`);
      const row = await tx.site.create({
        data: {
          tenantId,
          name,
          code: dto.code?.trim() || null,
          address: dto.address?.trim() || null,
        },
      });
      await this.audit.recordIn(tx, {
        tenantId,
        actorUserId: userId,
        action: 'site.created',
        entityType: 'site',
        entityId: row.id,
      });
      return toView(row);
    });
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    dto: UpdateSiteDto,
  ): Promise<SiteView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const current = await tx.site.findFirst({ where: { id, deletedAt: null } });
      if (!current) throw new NotFoundException('Site not found');
      const name = dto.name?.trim();
      if (name) {
        const clash = await tx.site.findFirst({
          where: { name, deletedAt: null, id: { not: id } },
        });
        if (clash) throw new BadRequestException(`A site named "${name}" already exists`);
      }
      const row = await tx.site.update({
        where: { id },
        data: {
          name: name ?? undefined,
          code: dto.code !== undefined ? dto.code.trim() || null : undefined,
          address: dto.address !== undefined ? dto.address.trim() || null : undefined,
          updatedAt: new Date(),
        },
      });
      await this.audit.recordIn(tx, {
        tenantId,
        actorUserId: userId,
        action: 'site.updated',
        entityType: 'site',
        entityId: id,
      });
      return toView(row);
    });
  }

  /**
   * Soft-delete a site. Jobs tagged with it keep their `siteId` (the row is merely hidden), so the
   * composite FK is never violated — we never hard-delete a site that jobs reference.
   */
  async remove(tenantId: string, userId: string, id: string): Promise<void> {
    await this.tenants.runInTenant(tenantId, async (tx) => {
      const current = await tx.site.findFirst({ where: { id, deletedAt: null } });
      if (!current) throw new NotFoundException('Site not found');
      await tx.site.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.recordIn(tx, {
        tenantId,
        actorUserId: userId,
        action: 'site.deleted',
        entityType: 'site',
        entityId: id,
      });
    });
  }

  /**
   * Confirm a site id belongs to THIS tenant and is live. Called by WorkItemService before it tags a
   * job with a site: the read runs under RLS, so another tenant's site id (or a soft-deleted one)
   * surfaces as "not found" rather than being silently stored. Keeps site validation in the module that
   * owns the table (§5) instead of letting work-items query onestack_site directly.
   */
  async assertInTenant(tenantId: string, siteId: string): Promise<void> {
    const site = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.site.findFirst({ where: { id: siteId, deletedAt: null } }),
    );
    if (!site) throw new BadRequestException('Unknown site');
  }
}

type SiteRow = {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  createdAt: Date;
};
function toView(r: SiteRow): SiteView {
  return {
    id: r.id,
    name: r.name,
    code: r.code,
    address: r.address,
    createdAt: r.createdAt.toISOString(),
  };
}
