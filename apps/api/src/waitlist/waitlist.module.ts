import { Module } from '@nestjs/common';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { WaitlistController } from './waitlist.controller';
import { WaitlistService } from './waitlist.service';

/**
 * Waitlist & auto-fill (Phase 4, card #210). Owns the waitlist table; reuses SchedulingModule's
 * overlap-checked booking create to confirm a fill. TenantService is global. Tenant-scoped.
 */
@Module({
  imports: [SchedulingModule],
  controllers: [WaitlistController],
  providers: [WaitlistService],
})
export class WaitlistModule {}
