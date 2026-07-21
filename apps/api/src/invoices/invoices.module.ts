import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { InvoiceController } from './invoice.controller';
import { InvoiceService } from './invoice.service';

// LineItemService + NotificationService come from their global modules.
@Module({
  controllers: [InvoiceController, FinanceController],
  providers: [InvoiceService],
  exports: [InvoiceService],
})
export class InvoicesModule {}
