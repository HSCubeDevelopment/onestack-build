import { Injectable } from '@nestjs/common';
import { TenantClient, TenantService } from '../tenancy/tenant.service';

export interface JobContext {
  tenantId: string;
}

/**
 * Background-job tenant-context wrapper (card #9.05). OFF-LIMITS / Tier-1.
 *
 * Jobs run OUTSIDE the request, so they have no ambient tenant — a classic multi-tenant leak. Every job
 * payload MUST carry tenantId, and this wrapper sets the SAME tenant context as the request path
 * (interactive transaction + set_config LOCAL, via TenantService) before any query runs. RLS then makes
 * it impossible for a worker processing Tenant A to read or write Tenant B's rows.
 */
@Injectable()
export class BackgroundJobRunner {
  constructor(private readonly tenants: TenantService) {}

  async run<T>(job: JobContext, fn: (tx: TenantClient) => Promise<T>): Promise<T> {
    if (!job.tenantId) {
      // Fail closed: a job with no tenant must never touch tenant data. (async → rejects, not sync-throw)
      throw new Error('Refusing to run a job without a tenantId (no tenant context).');
    }
    return this.tenants.runInTenant(job.tenantId, fn);
  }
}
