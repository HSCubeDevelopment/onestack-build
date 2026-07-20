import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AllowStaff } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SubjectView } from '../subjects/subject.service';
import { VehicleProfile, VehicleProfileService } from './vehicle-profile.service';

/**
 * Card 11.1 — "pull up a car". Deliberately @AllowStaff: the card says this is operational and should
 * be easy for EVERY internal role, because it is the lookup people use all day on the floor. What stays
 * gated is money, and that is handled inside the service (withheld until card 40.8 exists), not by
 * locking whole roles out of the screen.
 */
@Controller('vehicle-profile')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VehicleProfileController {
  constructor(private readonly profiles: VehicleProfileService) {}

  /** Search by rego or VIN. Partial, case- and space-insensitive. */
  @AllowStaff()
  @Get()
  search(@CurrentUser() user: AuthContext, @Query('q') q?: string): Promise<SubjectView[]> {
    return this.profiles.search(user.tenantId, q ?? '');
  }

  @AllowStaff()
  @Get(':id')
  profile(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<VehicleProfile> {
    return this.profiles.profile(user.tenantId, id);
  }
}
