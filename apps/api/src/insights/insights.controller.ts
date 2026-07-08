import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import {
  ActivitySummary,
  ChurnRisk,
  InsightsService,
  NoShowRisk,
} from './insights.service';

/**
 * AI insights & prediction — owner (Phase 3, card #142). Read-only signals a human acts on: upcoming
 * appointments ranked by no-show risk, customers at risk of churning (each with a DRAFT re-engagement
 * message), and a per-customer activity recap. Nothing here changes data or sends anything. Tenant-scoped.
 */
@Controller('insights')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get('no-show-risk')
  noShowRisk(@CurrentUser() user: AuthContext): Promise<NoShowRisk[]> {
    return this.insights.noShowRisk(user.tenantId);
  }

  @Get('churn-risk')
  churnRisk(@CurrentUser() user: AuthContext): Promise<ChurnRisk[]> {
    return this.insights.churnRisk(user.tenantId);
  }

  @Get('contacts/:id/summary')
  contactSummary(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
  ): Promise<ActivitySummary> {
    return this.insights.contactSummary(user.tenantId, id);
  }
}
