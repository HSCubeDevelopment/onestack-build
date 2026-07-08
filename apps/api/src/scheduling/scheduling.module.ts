import { Module } from '@nestjs/common';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { ResourceController } from './resource.controller';
import { ResourceService } from './resource.service';
import { SchedulingController } from './scheduling.controller';

/**
 * Calendar & resource scheduling (card #23), plus the original feature-flag demo route. The whole
 * module is toggleable — every route is gated behind the `scheduling` feature (OFF by default).
 */
@Module({
  controllers: [SchedulingController, ResourceController, BookingController],
  providers: [ResourceService, BookingService],
  exports: [ResourceService, BookingService], // online booking reuses the overlap-checked booking create
})
export class SchedulingModule {}
