import { Module } from '@nestjs/common';
import { EstimateDraftService } from './estimate-draft.service';

/**
 * Saved editable photo-estimate drafts. Owns onestack_estimate_draft; exposes only its service so other
 * modules (vehicle-profile, which drives the employee estimate flow) persist and reopen drafts through it
 * rather than touching its table (§5). TenantService is global. Draft only — no money quote here.
 */
@Module({
  providers: [EstimateDraftService],
  exports: [EstimateDraftService],
})
export class EstimateDraftModule {}
