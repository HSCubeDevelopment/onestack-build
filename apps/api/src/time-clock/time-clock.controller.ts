import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CheckInDto } from './dto/check-in.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AllowStaff, Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ClockStatus, StaffTotal, TimeClockService, TimeEntryView } from './time-clock.service';

/**
 * Staff time clock. Any authenticated user checks themselves in/out and reads their own status/history;
 * OWNER additionally reads the hours-logged summary across all staff. Tenant-scoped.
 */
@Controller('time-clock')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TimeClockController {
  constructor(private readonly clock: TimeClockService) {}

  @AllowStaff()
  @Post('check-in')
  @HttpCode(200)
  checkIn(@CurrentUser() user: AuthContext, @Body() dto: CheckInDto): Promise<ClockStatus> {
    return this.clock.checkIn(
      user.tenantId,
      user.userId,
      dto.position ?? null,
      dto.overrideReason ? { reason: dto.overrideReason } : null,
    );
  }

  /**
   * Check-ins that bypassed the geofence — the owner's review queue.
   *
   * NOT @AllowStaff: an employee should not be able to read who else clocked on from where. That is
   * the whole reason this data is collected, and it is exactly the data that becomes surveillance if
   * it is readable by peers.
   */
  @Get('overrides')
  overrides(@CurrentUser() user: AuthContext): Promise<TimeEntryView[]> {
    return this.clock.overrides(user.tenantId);
  }

  @AllowStaff()
  @Post('check-out')
  @HttpCode(200)
  checkOut(@CurrentUser() user: AuthContext): Promise<ClockStatus> {
    return this.clock.checkOut(user.tenantId, user.userId);
  }

  @AllowStaff()
  @Get('status')
  status(@CurrentUser() user: AuthContext): Promise<ClockStatus> {
    return this.clock.status(user.tenantId, user.userId);
  }

  @AllowStaff()
  @Get('entries')
  myEntries(@CurrentUser() user: AuthContext): Promise<TimeEntryView[]> {
    return this.clock.myEntries(user.tenantId, user.userId);
  }

  /** OWNER — hours logged per staff member over an optional [from, to] window. */
  @Get('summary')
  @Roles('OWNER')
  summary(
    @CurrentUser() user: AuthContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<StaffTotal[]> {
    return this.clock.summary(user.tenantId, from, to);
  }
}
