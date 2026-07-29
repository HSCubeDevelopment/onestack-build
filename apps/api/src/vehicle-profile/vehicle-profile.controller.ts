import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AllowStaff } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AttachmentView } from '../work-items/attachment.service';
import { SubjectView } from '../subjects/subject.service';
import { EstimateDraftView } from '../estimate-draft/estimate-draft.service';
import { AddVehiclePhotoDto } from './dto/vehicle-photo.dto';
import { CreateDraftVehicleDto } from './dto/create-draft.dto';
import { SaveEstimateDto } from './dto/save-estimate.dto';
import {
  EmployeeJobDetail,
  VehicleProfile,
  VehicleProfileService,
} from './vehicle-profile.service';

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

  /**
   * Add a Before / During / After photo to a car (attaches to its current job). @AllowStaff, like the
   * rest of this "pull up a car" surface — any worker on the floor can document the car they're on.
   */
  @AllowStaff()
  @Post(':id/photos')
  addPhoto(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: AddVehiclePhotoDto,
  ): Promise<{ attachment: AttachmentView; jobId: string; jobReference: string }> {
    return this.profiles.addPhoto(user.tenantId, user.userId, id, dto);
  }

  /**
   * Start a draft car from a registration when the plate isn't found — creates (or reuses) the vehicle
   * and ensures it has an open job, so an estimate can be saved against it. @AllowStaff, like tow-in.
   */
  @AllowStaff()
  @Post('draft')
  createDraft(
    @CurrentUser() user: AuthContext,
    @Body() dto: CreateDraftVehicleDto,
  ): Promise<{
    vehicleId: string;
    rego: string;
    label: string;
    jobId: string;
    jobReference: string;
  }> {
    return this.profiles.createDraft(user.tenantId, user.userId, dto);
  }

  /**
   * Save an AI photo-estimate against the car (summary note + photos on its current job + a structured
   * draft that can be reopened and edited in place). Draft only — never a money quote.
   */
  @AllowStaff()
  @Post(':id/estimate')
  saveEstimate(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: SaveEstimateDto,
  ): Promise<{ jobId: string; jobReference: string; photoCount: number; draftId: string }> {
    return this.profiles.saveEstimate(user.tenantId, user.userId, id, dto);
  }

  /** The car's saved estimate draft (to reopen and edit), or null if it has none. */
  @AllowStaff()
  @Get(':id/estimate')
  estimateDraft(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Query('jobId') jobId?: string,
  ): Promise<EstimateDraftView | null> {
    return this.profiles.getEstimateDraft(user.tenantId, id, jobId);
  }

  /**
   * A single job's full detail for the employee mobile view (opened from Car history) — everything the
   * owner's job page shows. Money inside it stays behind the finance gate (40.8), applied per-caller in
   * the service, so this staying @AllowStaff does not widen who can see dollars.
   */
  @AllowStaff()
  @Get('jobs/:jobId')
  jobDetail(
    @CurrentUser() user: AuthContext,
    @Param('jobId') jobId: string,
  ): Promise<EmployeeJobDetail> {
    return this.profiles.jobDetail(user.tenantId, jobId, {
      userId: user.userId,
      role: user.role,
    });
  }

  /** Stream a car photo's bytes (verified to belong to one of the car's jobs). Rendered in an <img>. */
  @AllowStaff()
  @Get(':id/photos/:attachmentId/content')
  async photoContent(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { bytes, contentType, fileName } = await this.profiles.photoContent(
      user.tenantId,
      id,
      attachmentId,
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${fileName.replace(/"/g, '')}"`);
    res.send(bytes);
  }
}
