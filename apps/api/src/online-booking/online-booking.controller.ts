import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UpsertBookingPageDto } from './dto/online-booking.dto';
import { BookingPageView, OnlineBookingService } from './online-booking.service';

/**
 * Online booking — owner config (Phase 3). Set up the shop's public booking page: which resources are
 * bookable, the default slot length, whether it's live, and the shareable token. Tenant-scoped.
 */
@Controller('booking-page')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OnlineBookingController {
  constructor(private readonly onlineBooking: OnlineBookingService) {}

  @Get()
  get(@CurrentUser() user: AuthContext): Promise<BookingPageView> {
    return this.onlineBooking.getConfig(user.tenantId);
  }

  @Put()
  upsert(
    @CurrentUser() user: AuthContext,
    @Body() dto: UpsertBookingPageDto,
  ): Promise<BookingPageView> {
    return this.onlineBooking.upsertConfig(user.tenantId, dto);
  }

  @Post('regenerate-token')
  regenerate(@CurrentUser() user: AuthContext): Promise<BookingPageView> {
    return this.onlineBooking.regenerateToken(user.tenantId);
  }
}
