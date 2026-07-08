import { Module } from '@nestjs/common';
import { BrandingController } from './branding.controller';
import { BrandingService } from './branding.service';

/**
 * Brand profile (Phase 3, card #151). Owns the per-tenant brand and exposes BrandingService so
 * customer-facing surfaces (the public booking page, portal) render under the shop's brand. TenantService
 * comes from the global TenantModule. Owns one table; tenant-scoped.
 */
@Module({
  controllers: [BrandingController],
  providers: [BrandingService],
  exports: [BrandingService],
})
export class BrandingModule {}
