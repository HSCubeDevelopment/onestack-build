import { Module } from '@nestjs/common';
import { ContactsModule } from '../contacts/contacts.module';
import { TagController } from './tag.controller';
import { TagService } from './tag.service';

/**
 * Segmentation & tagging (Phase 3). Tag catalogue + contact↔tag assignments, for grouping customers into
 * segments. Reads the shared Contact record through ContactsModule's public service (never its table).
 */
@Module({
  imports: [ContactsModule],
  controllers: [TagController],
  providers: [TagService],
})
export class TagsModule {}
