import { BadRequestException, Injectable } from '@nestjs/common';
import { TenantService } from '../tenancy/tenant.service';
import { CATALOGUE, catalogueEntry } from './catalogue';

export interface IntegrationView {
  slug: string;
  name: string;
  category: string;
  description: string;
  available: boolean;
  status: 'connected' | 'disconnected' | 'not_connected';
  connectedAt: string | null;
}

/**
 * Integration marketplace (Phase 4, card #253). GENERIC core (Platform). Merges the built-in catalogue with
 * this tenant's connection records. Connecting records intent + config; the actual vendor wiring is deferred
 * (available=false entries are "coming soon"). Tenant-scoped.
 */
@Injectable()
export class MarketplaceService {
  constructor(private readonly tenants: TenantService) {}

  async list(tenantId: string): Promise<IntegrationView[]> {
    const conns = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.integrationConnection.findMany(),
    );
    const byslug = new Map(conns.map((c) => [c.slug, c]));
    return CATALOGUE.map((entry) => {
      const conn = byslug.get(entry.slug);
      return {
        ...entry,
        status: conn ? (conn.status as 'connected' | 'disconnected') : 'not_connected',
        connectedAt: conn?.status === 'connected' ? conn.connectedAt.toISOString() : null,
      };
    });
  }

  async connect(tenantId: string, slug: string, config?: Record<string, unknown>): Promise<IntegrationView> {
    const entry = catalogueEntry(slug);
    if (!entry) throw new BadRequestException('Unknown integration');
    await this.tenants.runInTenant(tenantId, async (tx) => {
      const existing = await tx.integrationConnection.findFirst({ where: { slug } });
      if (existing)
        await tx.integrationConnection.update({ where: { id: existing.id }, data: { status: 'connected', config: (config ?? {}) as object, updatedAt: new Date() } });
      else await tx.integrationConnection.create({ data: { tenantId, slug, config: (config ?? {}) as object } });
    });
    return this.one(tenantId, slug);
  }

  async disconnect(tenantId: string, slug: string): Promise<IntegrationView> {
    if (!catalogueEntry(slug)) throw new BadRequestException('Unknown integration');
    await this.tenants.runInTenant(tenantId, (tx) =>
      tx.integrationConnection.updateMany({ where: { slug }, data: { status: 'disconnected', updatedAt: new Date() } }),
    );
    return this.one(tenantId, slug);
  }

  private async one(tenantId: string, slug: string): Promise<IntegrationView> {
    return (await this.list(tenantId)).find((i) => i.slug === slug)!;
  }
}
