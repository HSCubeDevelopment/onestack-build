import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
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

  @Get('dispatch/board')
  board(@CurrentUser() user: AuthContext): Promise<{ lanes: DispatchLane[] }> {
    return this.dispatch.board(user.tenantId);
  }

  @Get('work-items/:jobId/dispatch')
  get(@CurrentUser() user: AuthContext, @Param('jobId') jobId: string): Promise<DispatchView> {
    return this.dispatch.get(user.tenantId, jobId);
  }

  @Post('work-items/:jobId/dispatch')
  set(
    @CurrentUser() user: AuthContext,
    @Param('jobId') jobId: string,
    @Body() dto: SetDispatchDto,
  ): Promise<DispatchView> {
    return this.dispatch.setStatus(user.tenantId, jobId, dto, user.userId);
  }
}
