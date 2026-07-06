import { Module } from '@nestjs/common';
import { SubjectModule } from '../subjects/subject.module';
import { WorkItemController } from './work-item.controller';
import { WorkItemService } from './work-item.service';

@Module({
  imports: [SubjectModule], // for a work item's linked subjects (e.g. a job's vehicle)
  controllers: [WorkItemController],
  providers: [WorkItemService],
  exports: [WorkItemService],
})
export class WorkItemModule {}
