import { Module } from '@nestjs/common';
import { WorkItemService } from './work-item.service';

@Module({
  providers: [WorkItemService],
  exports: [WorkItemService],
})
export class WorkItemModule {}
