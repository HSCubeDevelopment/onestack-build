import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AllowStaff } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TrackingResult, TrackingService } from './tracking.service';

/**
 * Live-location for fleet cars (CityTag, migration plan §9). Staff-accessible (owner + staff + tow can
 * see where a fleet car is); tenant is taken from the token, never a query param, so a shop only ever
 * resolves its own tags.
 */
@Controller('tracking')
@UseGuards(JwtAuthGuard, RolesGuard)
@AllowStaff()
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  @Get('location')
  location(@CurrentUser() user: AuthContext, @Query('rego') rego = ''): Promise<TrackingResult> {
    return this.tracking.locate(user.tenantId, rego);
  }
}
