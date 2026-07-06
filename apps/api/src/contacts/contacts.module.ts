import { Module } from '@nestjs/common';
import { SubjectModule } from '../subjects/subject.module';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { LeadController } from './lead.controller';
import { LeadFormService } from './lead-form.service';
import { LeadService } from './lead.service';
import { PublicLeadController } from './public-lead.controller';
import { VehiclesController } from './vehicles.controller';

/**
 * Customer & CRM domain: Contacts (the shared core record), Vehicles (pack Subjects), and Leads
 * (inbound enquiries that convert into Contacts — card #12). Leads live here so conversion into a
 * Contact stays within one module. NotificationService comes from the global notifications module.
 */
@Module({
  imports: [SubjectModule], // vehicles are pack Subjects
  controllers: [ContactsController, VehiclesController, LeadController, PublicLeadController],
  providers: [ContactsService, LeadFormService, LeadService],
  exports: [ContactsService], // the shared Contact record — read by the board read-model (#22)
})
export class ContactsModule {}
