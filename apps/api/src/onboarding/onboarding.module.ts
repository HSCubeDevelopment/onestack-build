import { Module } from '@nestjs/common';
import { BrandingModule } from '../branding/branding.module';
import { ContactsModule } from '../contacts/contacts.module';
import { OnlineBookingModule } from '../online-booking/online-booking.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { WorkItemModule } from '../work-items/work-item.module';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';

/**
 * Onboarding & data migration (Phase 3, card #152). GENERIC core. Imports customers from CSV (previewable,
 * per-row, de-duplicated, capped, human-confirmed) and computes a setup checklist to first value. Composes
 * ContactsModule, SchedulingModule (resources), OnlineBookingModule (booking page), BrandingModule and
 * WorkItemModule. Owns no tables; tenant isolation comes from the underlying services.
 */
@Module({
  imports: [
    ContactsModule,
    SchedulingModule,
    OnlineBookingModule,
    BrandingModule,
    WorkItemModule,
  ],
  controllers: [OnboardingController],
  providers: [OnboardingService],
})
export class OnboardingModule {}
