import { Module } from '@nestjs/common';
import { TimeClockController } from './time-clock.controller';
import { TimeClockService } from './time-clock.service';

/**
 * Staff time clock — check-in / check-out attendance + OWNER hours summary. Owns the time-entry table;
 * TenantService is global.
 */
@Module({
  controllers: [TimeClockController],
  providers: [TimeClockService],
})
export class TimeClockModule {}
