import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module';
import { WorkItemModule } from '../work-items/work-item.module';
import { YardsModule } from '../yards/yards.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/**
 * Owner dashboard (card #52) — a read-model composing WorkItemService (job counts), InvoiceService
 * (money aggregates) and YardsService (cars in yards). Owns no tables; PackRegistry comes from the
 * global CoreModule.
 */
@Module({
  imports: [WorkItemModule, InvoicesModule, YardsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
