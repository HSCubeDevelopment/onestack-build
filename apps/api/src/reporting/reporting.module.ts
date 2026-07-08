import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { WorkItemModule } from '../work-items/work-item.module';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';

/**
 * Reporting & dashboards (Phase 3, card #145). GENERIC core read-model composing WorkItemService (jobs),
 * InvoiceService (money aggregates — read only, never modified), and Scheduling (bookings/resources for
 * utilisation). PackRegistry comes from the global CoreModule. Owns no tables; tenant isolation is enforced
 * by the underlying services.
 */
@Module({
  imports: [WorkItemModule, InvoicesModule, SchedulingModule],
  controllers: [ReportingController],
  providers: [ReportingService],
})
export class ReportingModule {}
