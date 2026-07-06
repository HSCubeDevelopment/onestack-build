import { Module } from '@nestjs/common';
import { SubjectModule } from '../subjects/subject.module';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { VehiclesController } from './vehicles.controller';

@Module({
  imports: [SubjectModule], // vehicles are pack Subjects
  controllers: [ContactsController, VehiclesController],
  providers: [ContactsService],
})
export class ContactsModule {}
