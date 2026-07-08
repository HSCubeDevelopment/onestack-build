import { Module } from '@nestjs/common';
import { ContactsModule } from '../contacts/contacts.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { QuotesModule } from '../quotes/quotes.module';
import { WorkItemModule } from '../work-items/work-item.module';
import { CustomerTimelineController } from './customer-timeline.controller';
import { CustomerTimelineService } from './customer-timeline.service';

/**
 * Customer timeline (Phase 3). A read-model that merges a customer's jobs + notes (with quote/invoice
 * summaries) into one chronological feed. Reads each domain through its public service — WorkItemModule
 * (jobs + notes), QuotesModule, InvoicesModule, ContactsModule — never their tables. No new table.
 */
@Module({
  imports: [ContactsModule, WorkItemModule, QuotesModule, InvoicesModule],
  controllers: [CustomerTimelineController],
  providers: [CustomerTimelineService],
})
export class TimelineModule {}
