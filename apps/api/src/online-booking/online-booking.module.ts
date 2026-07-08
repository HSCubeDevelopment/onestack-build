import { Module } from '@nestjs/common';
import { ContactsModule } from '../contacts/contacts.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { OnlineBookingController } from './online-booking.controller';
import { OnlineBookingService } from './online-booking.service';
import { PublicBookingController } from './public-booking.controller';

/**
 * Online booking (Phase 3). Owner config for a public self-service booking page + the public token-keyed
 * endpoints. Reuses SchedulingModule (resources + the overlap-checked booking create) and ContactsModule
 * (creating the customer). PrismaService (BYPASSRLS token resolve) + TenantService come from the global
 * TenantModule. Deposits (payments) + Google/social channels are deferred.
 */
@Module({
  imports: [SchedulingModule, ContactsModule],
  controllers: [OnlineBookingController, PublicBookingController],
  providers: [OnlineBookingService],
  exports: [OnlineBookingService],
})
export class OnlineBookingModule {}
