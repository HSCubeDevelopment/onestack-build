import { Module } from '@nestjs/common';
import { ContactsModule } from '../contacts/contacts.module';
import { SubjectModule } from '../subjects/subject.module';
import { WorkItemModule } from '../work-items/work-item.module';
import { TowService } from './tow.service';
import { YardsController } from './yards.controller';
import { YardsService } from './yards.service';

/**
 * Yards & vehicle logistics (YRD-1/YRD-2). A plain core module — no pack registry, no workflow engine.
 * The tow collection (YRD-2) composes the Contacts, Subject and WorkItem services (cross-service, never
 * cross-table) to spin up a contact + vehicle + job. NotificationService is global.
 */
@Module({
  imports: [ContactsModule, SubjectModule, WorkItemModule],
  controllers: [YardsController],
  providers: [YardsService, TowService],
  exports: [YardsService],
})
export class YardsModule {}
