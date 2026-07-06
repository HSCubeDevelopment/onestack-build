import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { DashboardService, DashboardSummary } from './dashboard.service';

/** Owner dashboard (card #52). Read-only "my numbers" home; tenant-scoped by the services it composes. */
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  summary(
    @CurrentUser() user: AuthContext,
    @Query('jobType') jobType = 'job',
  ): Promise<DashboardSummary> {
    return this.dashboard.getSummary(user.tenantId, jobType);
  }
}
