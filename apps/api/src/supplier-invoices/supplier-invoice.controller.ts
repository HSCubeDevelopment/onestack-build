import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import {
  CreateSupplierInvoiceDto,
  EditSupplierInvoiceLineDto,
  ScanSupplierInvoiceDto,
  UpdateSupplierInvoiceDto,
} from './dto/supplier-invoice.dto';
import { SupplierInvoiceService, SupplierInvoiceView } from './supplier-invoice.service';
import { BookkeepingResult, OcrScanResult } from './supplier-invoice-vendors';

/**
 * Supplier invoice capture (Phase 2). Capture a supplier's invoice against a job, adjust it, confirm it,
 * and (through the vendor boundary) export it to accounting. OCR scan pre-fills a draft from a scanned
 * invoice (vendor boundary). All routes are tenant-scoped by the service. Nothing is exported or scanned
 * for real until a provider is wired.
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class SupplierInvoiceController {
  constructor(private readonly invoices: SupplierInvoiceService) {}

  @Post('work-items/:jobId/supplier-invoices')
  create(
    @CurrentUser() user: AuthContext,
    @Param('jobId') jobId: string,
    @Body() dto: CreateSupplierInvoiceDto,
  ): Promise<SupplierInvoiceView> {
    return this.invoices.create(user.tenantId, jobId, dto);
  }

  @Get('work-items/:jobId/supplier-invoices')
  list(
    @CurrentUser() user: AuthContext,
    @Param('jobId') jobId: string,
  ): Promise<SupplierInvoiceView[]> {
    return this.invoices.listForJob(user.tenantId, jobId);
  }

  /** OCR a scanned invoice attached to the job into a suggested draft (vendor boundary). */
  @Post('work-items/:jobId/supplier-invoices/scan')
  scan(
    @CurrentUser() user: AuthContext,
    @Param('jobId') jobId: string,
    @Body() dto: ScanSupplierInvoiceDto,
  ): Promise<OcrScanResult> {
    return this.invoices.scan(user.tenantId, jobId, dto.attachmentId);
  }

  @Get('supplier-invoices/:id')
  get(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<SupplierInvoiceView> {
    return this.invoices.get(user.tenantId, id);
  }

  @Patch('supplier-invoices/:id')
  update(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateSupplierInvoiceDto,
  ): Promise<SupplierInvoiceView> {
    return this.invoices.updateHeader(user.tenantId, id, dto);
  }

  @Patch('supplier-invoices/:id/lines/:lineId')
  editLine(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() dto: EditSupplierInvoiceLineDto,
  ): Promise<SupplierInvoiceView> {
    return this.invoices.editLine(user.tenantId, id, lineId, dto);
  }

  @Delete('supplier-invoices/:id/lines/:lineId')
  removeLine(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
  ): Promise<SupplierInvoiceView> {
    return this.invoices.removeLine(user.tenantId, id, lineId);
  }

  @Post('supplier-invoices/:id/confirm')
  confirm(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<SupplierInvoiceView> {
    return this.invoices.confirm(user.tenantId, id);
  }

  /** Vendor boundary: pushes a confirmed invoice to accounting if a provider is configured. */
  @Post('supplier-invoices/:id/export-to-accounting')
  exportToAccounting(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
  ): Promise<{ invoice: SupplierInvoiceView; result: BookkeepingResult }> {
    return this.invoices.exportToAccounting(user.tenantId, id);
  }
}
