import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AddInvoiceLineDto, CreateInvoiceDto } from './dto/invoice.dto';
import { InvoiceService, InvoiceView } from './invoice.service';

/** Invoice API (card #40). From a job or an accepted quote; paid manually (records who + when). */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class InvoiceController {
  constructor(private readonly invoices: InvoiceService) {}

  @Post('work-items/:jobId/invoices')
  createFromJob(
    @CurrentUser() user: AuthContext,
    @Param('jobId') jobId: string,
    @Body() dto: CreateInvoiceDto,
  ): Promise<InvoiceView> {
    return this.invoices.createFromJob(user.tenantId, jobId, dto.dueDate);
  }

  @Post('quotes/:quoteId/invoice')
  createFromQuote(
    @CurrentUser() user: AuthContext,
    @Param('quoteId') quoteId: string,
    @Body() dto: CreateInvoiceDto,
  ): Promise<InvoiceView> {
    return this.invoices.createFromQuote(user.tenantId, quoteId, dto.dueDate);
  }

  @Get('work-items/:jobId/invoices')
  listForJob(
    @CurrentUser() user: AuthContext,
    @Param('jobId') jobId: string,
  ): Promise<InvoiceView[]> {
    return this.invoices.listForJob(user.tenantId, jobId);
  }

  @Get('invoices/:id')
  get(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<InvoiceView> {
    return this.invoices.get(user.tenantId, id);
  }

  @Post('invoices/:id/lines')
  addLine(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: AddInvoiceLineDto,
  ): Promise<InvoiceView> {
    return this.invoices.addLine(user.tenantId, id, dto);
  }

  @Delete('invoices/:id/lines/:lineId')
  removeLine(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
  ): Promise<InvoiceView> {
    return this.invoices.removeLine(user.tenantId, id, lineId);
  }

  @Post('invoices/:id/send')
  send(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<{ sent: true }> {
    return this.invoices.send(user.tenantId, id);
  }

  @Post('invoices/:id/mark-paid')
  markPaid(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<InvoiceView> {
    return this.invoices.markPaid(user.tenantId, id, user.userId);
  }

  @Post('invoices/:id/void')
  voidInvoice(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<InvoiceView> {
    return this.invoices.void(user.tenantId, id);
  }
}
