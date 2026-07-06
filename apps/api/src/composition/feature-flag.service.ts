import { Injectable } from '@nestjs/common';
import { TenantService } from '../tenancy/tenant.service';
import { ModuleKey, MODULES, moduleDefault } from './module-registry';

/**
 * Resolves whether a module is on for a tenant (card #6). Flags are tenant-scoped rows read through the
 * tenant-context wrapper, so a tenant can only ever see/set its own flags (RLS enforces it).
 * No row → fall back to the module's registry default.
 */
@Injectable()
export class FeatureFlagService {
  constructor(private readonly tenants: TenantService) {}

  async isEnabled(tenantId: string, key: ModuleKey): Promise<boolean> {
    const flag = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.featureFlag.findUnique({ where: { tenantId_key: { tenantId, key } } }),
    );
    return flag ? flag.enabled : moduleDefault(key);
  }

  async setEnabled(tenantId: string, key: ModuleKey, enabled: boolean): Promise<void> {
    await this.tenants.runInTenant(tenantId, (tx) =>
      tx.featureFlag.upsert({
        where: { tenantId_key: { tenantId, key } },
        create: { tenantId, key, enabled },
        update: { enabled },
      }),
    );
  }

  /** The full module → enabled map for a tenant (defaults merged with overrides). */
  async allForTenant(tenantId: string): Promise<Record<ModuleKey, boolean>> {
    const rows = await this.tenants.runInTenant(tenantId, (tx) => tx.featureFlag.findMany());
    const overrides = new Map(rows.map((r) => [r.key, r.enabled]));
    const out = {} as Record<ModuleKey, boolean>;
    for (const key of Object.keys(MODULES) as ModuleKey[]) {
      out[key] = overrides.has(key) ? (overrides.get(key) as boolean) : moduleDefault(key);
    }
    return out;
  }
}
