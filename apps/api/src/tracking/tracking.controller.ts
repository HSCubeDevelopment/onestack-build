import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AllowStaff } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { FleetTrackingResult, TrackingResult, TrackingService } from './tracking.service';

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

  /**
   * Every tag on this shop's account that has a position — the input for "which cars are at this yard".
   *
   * Matching a car to a yard is done by the CALLER, not here: this module owns tags, the yards module
   * owns yards, and neither should reach into the other (CLAUDE.md §5). The web app already holds the
   * yard list and the distance helper, so it does the join.
   *
   * Nothing is persisted. A position exists for the length of this response — the shop's stated rule is
   * that a live position is never stored, and deriving a yard from one does not change that.
   */
  @Get('fleet')
  fleet(@CurrentUser() user: AuthContext): Promise<FleetTrackingResult> {
    return this.tracking.fleet(user.tenantId);
  }
}
