import { Body, Controller, ForbiddenException, Get, HttpCode, Post } from '@nestjs/common';
import { IsString, IsUUID, Matches } from 'class-validator';
import { PinAuthService, PinDirectoryEntry, PinLoginResult } from './pin-auth.service';

export class PinLoginDto {
  @IsUUID()
  userId!: string;

  @IsString()
  @Matches(/^[0-9]{4}$/, { message: 'PIN must be 4 digits' })
  pin!: string;
}

/**
 * PIN sign-in (shop-floor). `pin-directory` lists who can sign in (for the name-picker) and is gated the
 * same way as the demo directory; `pin-login` is the actual sign-in and is always available. Neither
 * returns a PIN or a hash. Public (no guard) — this is the entry point before any session exists.
 */
@Controller('auth')
export class PinController {
  constructor(private readonly pinAuth: PinAuthService) {}

  @Get('pin-directory')
  directory(): Promise<PinDirectoryEntry[]> {
    if (process.env.DEV_LOGIN_ENABLED !== 'true') {
      throw new ForbiddenException('PIN directory is not available');
    }
    return this.pinAuth.directory();
  }

  @Post('pin-login')
  @HttpCode(200)
  pinLogin(@Body() dto: PinLoginDto): Promise<PinLoginResult> {
    return this.pinAuth.pinLogin(dto.userId, dto.pin);
  }
}
