import { Module } from '@nestjs/common';
import { SchedulingController } from './scheduling.controller';

@Module({
  controllers: [SchedulingController],
})
export class SchedulingModule {}
