import { Module } from '@nestjs/common';
import { ContactsModule } from '../contacts/contacts.module';
import { SubjectModule } from '../subjects/subject.module';
import { WorkItemModule } from '../work-items/work-item.module';
import { BoardController } from './board.controller';
import { BoardService } from './board.service';

/**
 * Job board (card #22) — a read-model that composes existing services (work items + subjects + the shared
 * Contact record) into a kanban view. It owns no tables; PackRegistry comes from the global CoreModule.
 */
@Module({
  imports: [WorkItemModule, SubjectModule, ContactsModule],
  controllers: [BoardController],
  providers: [BoardService],
  exports: [BoardService], // dispatch board regroups the same cards by technician
})
export class BoardModule {}
