import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AllowStaff } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ActivityEvent, ActivityService } from './activity.service';

/**
 * Cross-car activity directory (employee "Car history" feed). @AllowStaff — like the rest of the
 * on-the-floor lookup surface, any internal role can see what's moving through the yard.
 */
@Controller('activity')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @AllowStaff()
  @Get('feed')
  feed(@CurrentUser() user: AuthContext, @Query('limit') limit?: string): Promise<ActivityEvent[]> {
    const n = Number(limit);
    return this.activity.feed(user.tenantId, Number.isFinite(n) && n > 0 ? Math.min(n, 100) : 40);
  }
}
