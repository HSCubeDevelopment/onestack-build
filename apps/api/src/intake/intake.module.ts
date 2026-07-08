import { Module } from '@nestjs/common';
import { ContactsModule } from '../contacts/contacts.module';
import { IntakeController } from './intake.controller';
import { IntakeService } from './intake.service';

/**
 * Digital intake & forms (Phase 3). Custom forms + submissions against a customer. Reads the shared
 * Contact record through ContactsModule's public service (never its table).
 */
@Module({
  imports: [ContactsModule],
  controllers: [IntakeController],
  providers: [IntakeService],
})
export class IntakeModule {}
