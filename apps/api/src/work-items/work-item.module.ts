import { Module } from '@nestjs/common';
import { SubjectModule } from '../subjects/subject.module';
import { AttachmentService } from './attachment.service';
import {
  ATTACHMENT_STORAGE,
  InMemoryAttachmentStorage,
  SupabaseAttachmentStorage,
} from './attachment-storage';
import { NoteService } from './note.service';
import { WorkItemDetailController } from './work-item-detail.controller';
import { WorkItemController } from './work-item.controller';
import { WorkItemService } from './work-item.service';

@Module({
  imports: [SubjectModule], // for a work item's linked subjects (e.g. a job's vehicle)
  controllers: [WorkItemController, WorkItemDetailController],
  providers: [
    WorkItemService,
    NoteService,
    AttachmentService,
    {
      // Supabase Storage when a bucket is configured; in-memory otherwise (pure-unit runs). Card #21.
      provide: ATTACHMENT_STORAGE,
      useFactory: () => SupabaseAttachmentStorage.fromEnv() ?? new InMemoryAttachmentStorage(),
    },
  ],
  exports: [WorkItemService],
})
export class WorkItemModule {}
