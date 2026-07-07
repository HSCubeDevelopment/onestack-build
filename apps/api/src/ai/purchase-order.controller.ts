import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import {
  AddPoLineDto,
  CreatePurchaseOrderDto,
  EditPoLineDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto';
import { PurchaseOrderService, PurchaseOrderView } from './purchase-order.service';
import { SendResult } from './purchase-order-sender';

/**
 * AI photo-to-quote — draft purchase order (Phase 2 flagship, slice C). Seed a PO from the job's parts
 * list, adjust it, confirm it, and (through the vendor boundary) send it. The PO and its creation hang
 * off the job; the PO and its lines are addressed by id once created. Every route is tenant-scoped by
 * the service. Nothing is emailed until an email provider is configured — `send` reports honestly.
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class PurchaseOrderController {
  constructor(private readonly pos: PurchaseOrderService) {}

  @Post('work-items/:jobId/purchase-order')
  create(
    @CurrentUser() user: AuthContext,
    @Param('jobId') jobId: string,
    @Body() dto: CreatePurchaseOrderDto,
  ): Promise<PurchaseOrderView> {
    return this.pos.createFromParts(user.tenantId, jobId, dto);
  }

  @Get('work-items/:jobId/purchase-orders')
  list(
    @CurrentUser() user: AuthContext,
    @Param('jobId') jobId: string,
  ): Promise<PurchaseOrderView[]> {
    return this.pos.listForJob(user.tenantId, jobId);
  }

  @Get('purchase-orders/:id')
  get(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<PurchaseOrderView> {
    return this.pos.get(user.tenantId, id);
  }

  @Patch('purchase-orders/:id')
  update(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseOrderDto,
  ): Promise<PurchaseOrderView> {
    return this.pos.updateHeader(user.tenantId, id, dto);
  }

  @Post('purchase-orders/:id/lines')
  addLine(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: AddPoLineDto,
  ): Promise<PurchaseOrderView> {
    return this.pos.addLine(user.tenantId, id, dto);
  }

  @Patch('purchase-orders/:id/lines/:lineId')
  editLine(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() dto: EditPoLineDto,
  ): Promise<PurchaseOrderView> {
    return this.pos.editLine(user.tenantId, id, lineId, dto);
  }

  @Delete('purchase-orders/:id/lines/:lineId')
  removeLine(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
  ): Promise<PurchaseOrderView> {
    return this.pos.removeLine(user.tenantId, id, lineId);
  }

  @Post('purchase-orders/:id/confirm')
  confirm(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<PurchaseOrderView> {
    return this.pos.confirm(user.tenantId, id);
  }

  /** Vendor boundary: emails the PO if a provider is configured; otherwise reports it was not sent. */
  @Post('purchase-orders/:id/send')
  send(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
  ): Promise<{ purchaseOrder: PurchaseOrderView; result: SendResult }> {
    return this.pos.send(user.tenantId, id);
  }
}
