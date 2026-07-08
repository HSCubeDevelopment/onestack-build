import { Module } from '@nestjs/common';
import { ContactsModule } from '../contacts/contacts.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { WorkItemModule } from '../work-items/work-item.module';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';

/**
 * AI insights & prediction (Phase 3, card #142). GENERIC core module. Reuses SchedulingModule (bookings),
 * WorkItemModule (jobs) and ContactsModule (customers) to READ existing data through their services — it
 * owns no tables and stores nothing. Predictions are deterministic + explainable; every message is a DRAFT
 * a human confirms. Tenant isolation comes from the underlying services.
 */
@Module({
  imports: [SchedulingModule, WorkItemModule, ContactsModule],
  controllers: [InsightsController],
  providers: [InsightsService],
})
export class InsightsModule {}
