import { Module } from '@nestjs/common';
import { SitesController } from './sites.controller';
import { SitesService } from './sites.service';

/**
 * Multi-site (SITE-1). A plain core module owning `onestack_site`. It imports nothing (TenantService +
 * AuditService are global), so it can be safely imported by WorkItemModule (to validate a job's site)
 * and DashboardModule (per-site counts) WITHOUT a dependency cycle — this module never depends on them.
 */
@Module({
  controllers: [SitesController],
  providers: [SitesService],
  exports: [SitesService],
})
export class SitesModule {}
