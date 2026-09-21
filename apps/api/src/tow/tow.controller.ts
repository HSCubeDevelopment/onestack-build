import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AllowStaff } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateTowJobDto } from './dto/tow-job.dto';
import { TowActivity, TowDispatchService, TowJobView, TowPhoto } from './tow-dispatch.service';

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

  /**
   * Every tow in the shop — what the driver is on now and what he has finished.
   *
   * ⚠️ Open to all staff on purpose. The front desk fields "where is my car?" and needs to answer it
   * without being assigned to the tow. See TowDispatchService.activity for why this widening reaches
   * tow work and nothing else.
   */
  @AllowStaff()
  @Get('activity')
  activity(@CurrentUser() user: AuthContext): Promise<TowActivity> {
    return this.tow.activity(user.tenantId);
  }

  /** The photos on one tow. 404s for any job that is not a tow. */
  @AllowStaff()
  @Get('jobs/:jobId/photos')
  photos(
    @CurrentUser() user: AuthContext,
    @Param('jobId', new ParseUUIDPipe({ version: '4' })) jobId: string,
  ): Promise<TowPhoto[]> {
    return this.tow.photos(user.tenantId, jobId);
  }

  /** Raw bytes for one tow photo, so the office can actually look at what the driver shot. */
  @AllowStaff()
  @Get('jobs/:jobId/photos/:photoId/content')
  async photoContent(
    @CurrentUser() user: AuthContext,
    @Param('jobId', new ParseUUIDPipe({ version: '4' })) jobId: string,
    @Param('photoId', new ParseUUIDPipe({ version: '4' })) photoId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { bytes, contentType, fileName } = await this.tow.photoContent(
      user.tenantId,
      jobId,
      photoId,
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${fileName.replace(/"/g, '')}"`);
    res.send(bytes);
  }
}
