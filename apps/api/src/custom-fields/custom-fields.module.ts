import { Global, Module } from '@nestjs/common';
import { CustomFieldController } from './custom-field.controller';
import { CustomFieldService } from './custom-field.service';

/**
 * Custom fields (card #11) are a CORE capability shared by the customer (Contact) and vehicle (Subject)
 * domains, so the service is exported globally — both modules validate their `customFields` bag through it.
 */
@Global()
@Module({
  controllers: [CustomFieldController],
  providers: [CustomFieldService],
  exports: [CustomFieldService],
})
export class CustomFieldsModule {}
