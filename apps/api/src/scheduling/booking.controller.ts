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
  UseGuards,
} from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { FeatureGuard } from '../composition/feature.guard';
import { RequireFeature } from '../composition/require-feature.decorator';
import { BookingService, BookingView } from './booking.service';
import { CreateBookingDto, UpdateBookingDto } from './dto/scheduling.dto';

/**
 * Calendar bookings API (card #23). Gated behind the toggleable `scheduling` module — 404 until a shop
 * enables it. Overlap on a resource is prevented (409) unless the booking carries allowOverlap.
 */
@Controller('bookings')
@UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
@RequireFeature('scheduling')
export class BookingController {
  constructor(private readonly bookings: BookingService) {}

  @Post()
  create(@CurrentUser() user: AuthContext, @Body() dto: CreateBookingDto): Promise<BookingView> {
    return this.bookings.create(user.tenantId, dto);
  }

  /** Range fetch for Day/Week views: /bookings?from=…&to=… (ISO). Omit for everything. */
  @Get()
  list(
    @CurrentUser() user: AuthContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<BookingView[]> {
    return this.bookings.list(user.tenantId, from, to);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<BookingView> {
    return this.bookings.get(user.tenantId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateBookingDto,
  ): Promise<BookingView> {
    return this.bookings.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<void> {
    await this.bookings.remove(user.tenantId, id);
  }
}
