import { Module } from '@nestjs/common';
import { ContactsModule } from '../contacts/contacts.module';
import { SubjectModule } from '../subjects/subject.module';
import { WorkItemModule } from '../work-items/work-item.module';
import { TowController } from './tow.controller';
import { TowDispatchService } from './tow-dispatch.service';

/**
 * Tow dispatch — send a driver to collect a car and drop it at a yard. Owns no tables of its own: the
 * job is a work item, the tow detail rides on the existing dispatch sidecar (0054), and the yard is
 * referenced by id. TenantService is global.
 */
@Module({
  imports: [WorkItemModule, SubjectModule, ContactsModule],
  controllers: [TowController],
  providers: [TowDispatchService],
  exports: [TowDispatchService],
})
export class TowModule {}
