import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AllowStaff } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateTowJobDto } from './dto/tow-job.dto';
import { TowDispatchService, TowJobView } from './tow-dispatch.service';

/**
 * Tow dispatch. The office books a collection; the assigned driver sees it on their phone.
 *
 * Booking is open to STAFF as well as OWNER — the shop's front desk books tows, not just the owner.
 * That is safe here in a way that opening `POST /work-items/:id/assign` would not be: this creates a
 * NEW job and can only assign it to someone holding the TOW role. It cannot reach an existing job, so
 * a worker still cannot route the shop's work to themselves.
 *
 * A driver reads only their own list — `mine` filters on the job's assignees, and the underlying
 * work-item reads are already scoped so a non-owner 404s on anything not theirs.
 */
@Controller('tow')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TowController {
  constructor(private readonly tow: TowDispatchService) {}

  /** Who can be sent on a tow. Needed by the booking form. */
  @AllowStaff()
  @Get('drivers')
  drivers(@CurrentUser() user: AuthContext) {
    return this.tow.drivers(user.tenantId);
  }

  @AllowStaff()
  @Post('jobs')
  create(@CurrentUser() user: AuthContext, @Body() dto: CreateTowJobDto): Promise<TowJobView> {
    return this.tow.create(user.tenantId, user.userId, dto);
  }

  /** The signed-in driver's outstanding pickups. */
  @AllowStaff()
  @Get('mine')
  mine(@CurrentUser() user: AuthContext): Promise<TowJobView[]> {
    return this.tow.forDriver(user.tenantId, user.userId);
  }

  @AllowStaff()
  @Get('jobs/:jobId')
  one(
    @CurrentUser() user: AuthContext,
    @Param('jobId', new ParseUUIDPipe({ version: '4' })) jobId: string,
  ): Promise<TowJobView> {
    return this.tow.view(user.tenantId, jobId);
  }
}
