import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AllowStaff } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { assignedScopeFor } from '../auth/staff-scope';
import { DispatchLane } from './dispatch';
import { DispatchService, DispatchView } from './dispatch.service';
import { SetDispatchDto } from './dto/dispatch.dto';

/**
 * Dispatch & assignment (Phase 3). The dispatch board (jobs by technician) + per-job dispatch status/ETA.
 * Assignment reuses the work-item assign endpoint. Tenant-scoped by the service. GPS location + customer
 * notifications are deferred (vendor).
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class DispatchController {
  constructor(private readonly dispatch: DispatchService) {}

  /**
   * OWNER-only, and it must stay that way. The board is structurally unscoped — it lists every job in
   * the tenant and every customer name to label them — so opening it to a worker would hand them the
   * whole shop's work, not their own.
   */
  @Get('dispatch/board')
  board(@CurrentUser() user: AuthContext): Promise<{ lanes: DispatchLane[] }> {
    return this.dispatch.board(user.tenantId);
  }

  /** A driver reads and advances their OWN job — the scope below is what makes that safe. */
  @AllowStaff()
  @Get('work-items/:jobId/dispatch')
  get(@CurrentUser() user: AuthContext, @Param('jobId') jobId: string): Promise<DispatchView> {
    return this.dispatch.get(user.tenantId, jobId, assignedScopeFor(user));
  }

  @AllowStaff()
  @Post('work-items/:jobId/dispatch')
  set(
    @CurrentUser() user: AuthContext,
    @Param('jobId') jobId: string,
    @Body() dto: SetDispatchDto,
  ): Promise<DispatchView> {
    return this.dispatch.setStatus(user.tenantId, jobId, dto, user.userId, assignedScopeFor(user));
  }
}
