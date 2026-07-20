import { Module } from '@nestjs/common';
import { ContactsModule } from '../contacts/contacts.module';
import { SubjectModule } from '../subjects/subject.module';
import { WorkItemModule } from '../work-items/work-item.module';
import { VehicleProfileController } from './vehicle-profile.controller';
import { VehicleProfileService } from './vehicle-profile.service';

/**
 * Card 11.1 — the "pull up a car" 360 view. Owns NO tables: it composes the vehicle (Subject), its
 * customer (Contact), its jobs, notes and photos (WorkItem module) into one record, reading each
 * through that module's public service.
 */
@Module({
  imports: [SubjectModule, ContactsModule, WorkItemModule],
  controllers: [VehicleProfileController],
  providers: [VehicleProfileService],
  exports: [VehicleProfileService],
})
export class VehicleProfileModule {}
