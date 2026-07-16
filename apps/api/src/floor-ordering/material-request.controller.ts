import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AllowStaff, Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { assignedScopeFor } from '../auth/staff-scope';
import { WorkItemService } from '../work-items/work-item.service';
import { CreateMaterialRequestDto, DecisionDto } from './dto/material-request.dto';
import { OrderSendResult } from './material-order-sender';
import { MaterialRequestService, MaterialRequestView } from './material-request.service';

/**
 * Floor ordering (Phase 2). A technician raises a material request for a job; a manager (OWNER) approves
 * or rejects it; an approved request can be ordered (emailed to a supplier — vendor boundary, no-op until
 * wired). A technician (STAFF) may raise/read requests only against a job assigned to them; approve/
 * reject/order are OWNER-only. All routes are tenant-scoped by the service.
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class MaterialRequestController {
  constructor(
    private readonly requests: MaterialRequestService,
    private readonly workItems: WorkItemService,
  ) {}

  /** 404s when a STAFF caller isn't assigned to the job; no-op for OWNER. */
  private async assertJobVisible(user: AuthContext, jobId: string): Promise<void> {
    await this.workItems.get(user.tenantId, jobId, assignedScopeFor(user));
  }

  @AllowStaff()
  @Post('work-items/:jobId/material-requests')
  async create(
    @CurrentUser() user: AuthContext,
    @Param('jobId') jobId: string,
    @Body() dto: CreateMaterialRequestDto,
  ): Promise<MaterialRequestView> {
    await this.assertJobVisible(user, jobId);
    return this.requests.create(user.tenantId, jobId, user.userId, dto);
  }

  @AllowStaff()
  @Get('work-items/:jobId/material-requests')
  async list(
    @CurrentUser() user: AuthContext,
    @Param('jobId') jobId: string,
  ): Promise<MaterialRequestView[]> {
    await this.assertJobVisible(user, jobId);
    return this.requests.listForJob(user.tenantId, jobId);
  }

  @AllowStaff()
  @Get('material-requests/:id')
  async get(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
  ): Promise<MaterialRequestView> {
    // Resolved by request id, so re-check the owning job: otherwise a STAFF caller with an id could read
    // parts on a job that isn't theirs.
    const req = await this.requests.get(user.tenantId, id);
    await this.assertJobVisible(user, req.workItemId);
    return req;
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
