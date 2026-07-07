import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateMaterialRequestDto, DecisionDto } from './dto/material-request.dto';
import { OrderSendResult } from './material-order-sender';
import { MaterialRequestService, MaterialRequestView } from './material-request.service';

/**
 * Floor ordering (Phase 2). A technician raises a material request for a job; a manager (OWNER) approves
 * or rejects it; an approved request can be ordered (emailed to a supplier — vendor boundary, no-op until
 * wired). Create/list/read are open to any authenticated user; approve/reject/order are OWNER-only. All
 * routes are tenant-scoped by the service.
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class MaterialRequestController {
  constructor(private readonly requests: MaterialRequestService) {}

  @Post('work-items/:jobId/material-requests')
  create(
    @CurrentUser() user: AuthContext,
    @Param('jobId') jobId: string,
    @Body() dto: CreateMaterialRequestDto,
  ): Promise<MaterialRequestView> {
    return this.requests.create(user.tenantId, jobId, user.userId, dto);
  }

  @Get('work-items/:jobId/material-requests')
  list(
    @CurrentUser() user: AuthContext,
    @Param('jobId') jobId: string,
  ): Promise<MaterialRequestView[]> {
    return this.requests.listForJob(user.tenantId, jobId);
  }

  @Get('material-requests/:id')
  get(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<MaterialRequestView> {
    return this.requests.get(user.tenantId, id);
  }

  @Post('material-requests/:id/approve')
  @Roles('OWNER')
  approve(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: DecisionDto,
  ): Promise<MaterialRequestView> {
    return this.requests.approve(user.tenantId, id, user.userId, dto.note);
  }

  @Post('material-requests/:id/reject')
  @Roles('OWNER')
  reject(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: DecisionDto,
  ): Promise<MaterialRequestView> {
    return this.requests.reject(user.tenantId, id, user.userId, dto.note);
  }

  /** Vendor boundary: emails the approved request to the supplier if a provider is configured. */
  @Post('material-requests/:id/order')
  @Roles('OWNER')
  order(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
  ): Promise<{ request: MaterialRequestView; result: OrderSendResult }> {
    return this.requests.order(user.tenantId, id);
  }
}
