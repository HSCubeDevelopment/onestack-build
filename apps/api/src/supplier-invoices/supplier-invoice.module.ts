import { Module } from '@nestjs/common';
import { SupplierInvoiceController } from './supplier-invoice.controller';
import { SupplierInvoiceService } from './supplier-invoice.service';
import {
  BOOKKEEPING_SYNC,
  BookkeepingSync,
  NoopBookkeepingSync,
  NoopSupplierInvoiceOcr,
  SUPPLIER_INVOICE_OCR,
  SupplierInvoiceOcr,
} from './supplier-invoice-vendors';

/**
 * Supplier invoice capture (Phase 2). Manual editable-draft capture of a supplier's invoice against a
 * job, with two deferred vendor boundaries: OCR (scan → suggested draft) and accounting sync (push a
 * confirmed invoice to Xero/MYOB). Both are no-op by default — nothing external happens until wired.
 * Self-contained: reads the job via TenantService directly (its own tables).
 */
@Module({
  controllers: [SupplierInvoiceController],
  providers: [
    SupplierInvoiceService,
    {
      // OCR vendor boundary. No-op until an OCR provider is chosen.
      provide: SUPPLIER_INVOICE_OCR,
      useFactory: (): SupplierInvoiceOcr => new NoopSupplierInvoiceOcr(),
    },
    {
      // Accounting sync vendor boundary. No-op until Xero/MYOB is wired.
      provide: BOOKKEEPING_SYNC,
      useFactory: (): BookkeepingSync => new NoopBookkeepingSync(),
    },
  ],
})
export class SupplierInvoiceModule {}
