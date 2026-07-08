import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ReportingService, ReportOverview } from './reporting.service';

/**
 * Reporting & dashboards — owner (Phase 3, card #145). One read-only overview: revenue, jobs, turnaround
 * and utilisation over a period (defaults to the last 30 days; pass `from` to change it). Tenant-scoped.
 */
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  @Get('overview')
  overview(
    @CurrentUser() user: AuthContext,
    @Query('from') from?: string,
  ): Promise<ReportOverview> {
    return this.reporting.overview(user.tenantId, from);
  }
}
