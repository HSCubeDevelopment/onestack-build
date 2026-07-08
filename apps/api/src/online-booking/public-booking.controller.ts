import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PublicBookDto } from './dto/online-booking.dto';
import { OnlineBookingService, PublicBookingPage } from './online-booking.service';

/**
 * PUBLIC online booking (Phase 3) — NO auth guard: this is the 24/7 self-service endpoint the hosted
 * booking page posts to. Untrusted input, so: the DTO validates + length-caps every field, a honeypot
 * drops obvious bots, and the tenant is resolved from the unguessable page token (never a client id).
 * Deposits (payments) and Google/social channels are deferred.
 */
@Controller('public/booking')
export class PublicBookingController {
  constructor(private readonly onlineBooking: OnlineBookingService) {}

  @Get(':token')
  page(@Param('token') token: string): Promise<PublicBookingPage> {
    return this.onlineBooking.publicPage(token);
  }

  @Post(':token')
  book(
    @Param('token') token: string,
    @Body() dto: PublicBookDto,
  ): Promise<{ confirmed: boolean; bookingId: string; startsAt: string; endsAt: string }> {
    return this.onlineBooking.publicBook(token, dto);
  }
}
