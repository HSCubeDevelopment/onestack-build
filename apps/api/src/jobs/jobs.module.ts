import { Global, Module } from '@nestjs/common';
import { BackgroundJobRunner } from './job-runner';

@Global()
@Module({
  providers: [BackgroundJobRunner],
  exports: [BackgroundJobRunner],
})
export class JobsModule {}
