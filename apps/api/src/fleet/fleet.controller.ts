import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AllowStaff } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  AddFleetPhotoDto,
  CreateBookingDto,
  CreateMovementDto,
  CreateReturnDto,
  UpdateBookingDto,
  UpdateMovementDto,
  UpdateReturnDto,
  UpdateVehicleDto,
} from './dto/fleet.dto';
import { FleetPhotoService, FleetPhotoView } from './fleet-photo.service';
import { FleetBookingStatus, FleetMovementStatus } from './fleet.util';
import {
  FleetBookingView,
  FleetDashboardStats,
  FleetMovementView,
  FleetReturnView,
  FleetSearchResults,
  FleetService,
  FleetVehicleView,
  RegoConflict,
  RentalPeriod,
} from './fleet.service';

/**
 * Fleet & courtesy cars (migrated 1:1 from the "In N Out" staff app). Vehicles, movements (car in / loan
 * car out), returns, bookings, before/after photos, dashboard, universal search and import review. Any
 * authenticated staff member can read + write (matches the legacy app's single access level); every write
 * is audited and tenant-scoped by the services.
 */
@Controller('fleet')
@UseGuards(JwtAuthGuard, RolesGuard)
// The whole In N Out surface is a shop-floor STAFF activity (the legacy app had one flat access level).
// Applied at the class level so every fleet route admits OWNER + STAFF (+ TOW); reads/writes stay
// tenant-scoped by the service. Money/roles remain owner-only on their own controllers.
@AllowStaff()
export class FleetController {
  constructor(
    private readonly fleet: FleetService,
    private readonly photos: FleetPhotoService,
  ) {}

  // -------------------------------------------------- dashboard / search / review

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthContext): Promise<FleetDashboardStats> {
    return this.fleet.getDashboardStats(user.tenantId);
  }

  @Get('activity')
  activity(@CurrentUser() user: AuthContext, @Query('limit') limit?: string) {
    return this.fleet.recentActivity(user.tenantId, limit ? Number(limit) : 15);
  }

  @Get('today')
  async today(
    @CurrentUser() user: AuthContext,
  ): Promise<{ movements: FleetMovementView[]; returns: FleetReturnView[] }> {
    const [movements, returns] = await Promise.all([
      this.fleet.listTodaysMovements(user.tenantId),
      this.fleet.listTodaysReturns(user.tenantId),
    ]);
    return { movements, returns };
  }

  @Get('search')
  search(@CurrentUser() user: AuthContext, @Query('q') q = ''): Promise<FleetSearchResults> {
    return this.fleet.universalSearch(user.tenantId, q);
  }

  @Get('review')
  review(
    @CurrentUser() user: AuthContext,
  ): Promise<{ movements: FleetMovementView[]; returns: FleetReturnView[] }> {
    return this.fleet.listNeedsReview(user.tenantId);
  }

  @Post('review/clear')
  clearReview(@CurrentUser() user: AuthContext): Promise<{ cleared: number }> {
    return this.fleet.markAllReviewed(user.tenantId, user.userId);
  }

  // -------------------------------------------------- vehicles

  @Get('vehicles')
  listVehicles(@CurrentUser() user: AuthContext): Promise<FleetVehicleView[]> {
    return this.fleet.listVehicles(user.tenantId);
  }

  @Get('vehicles/lookup')
  lookupVehicle(
    @CurrentUser() user: AuthContext,
    @Query('rego') rego = '',
  ): Promise<FleetVehicleView | null> {
    return this.fleet.getVehicleByRego(user.tenantId, rego);
  }

  @Get('vehicles/conflicts')
  conflicts(@CurrentUser() user: AuthContext, @Query('rego') rego = ''): Promise<RegoConflict> {
    return this.fleet.getRegoConflicts(user.tenantId, rego);
  }

  @Get('vehicles/history')
  history(@CurrentUser() user: AuthContext, @Query('rego') rego = ''): Promise<RentalPeriod[]> {
    return this.fleet.listRentalHistoryByRego(user.tenantId, rego);
  }

  @Patch('vehicles/:id')
  updateVehicle(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateVehicleDto,
  ): Promise<FleetVehicleView> {
    return this.fleet.updateVehicle(user.tenantId, id, dto, user.userId);
  }

  // -------------------------------------------------- movements

  @Get('movements')
  listMovements(
    @CurrentUser() user: AuthContext,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ): Promise<FleetMovementView[]> {
    return this.fleet.listMovements(user.tenantId, {
      status: status as FleetMovementStatus | undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('movements')
  createMovement(
    @CurrentUser() user: AuthContext,
    @Body() dto: CreateMovementDto,
  ): Promise<FleetMovementView> {
    return this.fleet.createMovement(user.tenantId, user.userId, dto);
  }

  @Get('movements/:id')
  getMovement(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
  ): Promise<FleetMovementView> {
    return this.fleet.getMovement(user.tenantId, id);
  }

  @Patch('movements/:id')
  updateMovement(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateMovementDto,
  ): Promise<FleetMovementView> {
    return this.fleet.updateMovement(user.tenantId, id, dto, user.userId);
  }

  // -------------------------------------------------- returns

  @Get('returns')
  listReturns(
    @CurrentUser() user: AuthContext,
    @Query('limit') limit?: string,
  ): Promise<FleetReturnView[]> {
    return this.fleet.listReturns(user.tenantId, limit ? Number(limit) : 50);
  }

  @Post('returns')
  createReturn(
    @CurrentUser() user: AuthContext,
    @Body() dto: CreateReturnDto,
  ): Promise<{ ret: FleetReturnView; matchedMovement: FleetMovementView | null }> {
    return this.fleet.createReturn(user.tenantId, user.userId, dto);
  }

  @Get('returns/:id')
  getReturn(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<FleetReturnView> {
    return this.fleet.getReturn(user.tenantId, id);
  }

  @Patch('returns/:id')
  updateReturn(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateReturnDto,
  ): Promise<FleetReturnView> {
    return this.fleet.updateReturn(user.tenantId, id, dto, user.userId);
  }

  // -------------------------------------------------- bookings

  @Get('bookings')
  listBookings(
    @CurrentUser() user: AuthContext,
    @Query('status') status?: string,
  ): Promise<FleetBookingView[]> {
    const statuses = status
      ? (status.split(',').map((s) => s.trim()) as FleetBookingStatus[])
      : undefined;
    return this.fleet.listBookings(user.tenantId, statuses);
  }

  @Post('bookings')
  createBooking(
    @CurrentUser() user: AuthContext,
    @Body() dto: CreateBookingDto,
  ): Promise<FleetBookingView> {
    return this.fleet.createBooking(user.tenantId, user.userId, dto);
  }

  @Get('bookings/:id')
  getBooking(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<FleetBookingView> {
    return this.fleet.getBooking(user.tenantId, id);
  }

  @Patch('bookings/:id')
  updateBooking(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateBookingDto,
  ): Promise<FleetBookingView> {
    return this.fleet.updateBooking(user.tenantId, id, dto, user.userId);
  }

  @Post('bookings/:id/cancel')
  cancelBooking(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
  ): Promise<FleetBookingView> {
    return this.fleet.cancelBooking(user.tenantId, id, user.userId);
  }

  @Post('bookings/:id/convert')
  convertBooking(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
  ): Promise<FleetMovementView> {
    return this.fleet.convertBookingToMovement(user.tenantId, id, user.userId);
  }

  // -------------------------------------------------- photos

  @Get('photos')
  listPhotos(
    @CurrentUser() user: AuthContext,
    @Query('vehicleId') vehicleId?: string,
    @Query('movementId') movementId?: string,
    @Query('returnId') returnId?: string,
    @Query('bookingId') bookingId?: string,
  ): Promise<FleetPhotoView[]> {
    return this.photos.list(user.tenantId, { vehicleId, movementId, returnId, bookingId });
  }

  @Post('photos')
  addPhoto(
    @CurrentUser() user: AuthContext,
    @Body() dto: AddFleetPhotoDto,
  ): Promise<FleetPhotoView> {
    return this.photos.add(user.tenantId, user.userId, dto);
  }

  /** Stream the raw image bytes back (tenant-scoped). */
  @Get('photos/:id/content')
  async photoContent(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { bytes, contentType } = await this.photos.getContent(user.tenantId, id);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'inline');
    res.send(bytes);
  }

  @Delete('photos/:id')
  @HttpCode(204)
  async removePhoto(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<void> {
    await this.photos.remove(user.tenantId, id);
  }
}
