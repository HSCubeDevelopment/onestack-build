import { Module } from '@nestjs/common';
import { AssignedSitesResolver } from './assigned-sites.resolver';
import { TimeClockController } from './time-clock.controller';
import { TimeClockService } from './time-clock.service';

/**
 * Staff time clock — check-in / check-out attendance + OWNER hours summary. Owns the time-entry table;
 * TenantService is global. AssignedSitesResolver maps a worker to their assigned shop fences at check-in.
 */
@Module({
  controllers: [TimeClockController],
  providers: [TimeClockService, AssignedSitesResolver],
})
export class TimeClockModule {}
