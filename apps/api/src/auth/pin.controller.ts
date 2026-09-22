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

/** Sign in as a named person with no PIN. Only honoured while PIN checks are switched off. */
export class OpenLoginDto {
  @IsUUID()
  userId!: string;
}

/**
 * PIN sign-in (shop-floor). `pin-directory` lists who can sign in (for the name-picker) and is gated the
 * same way as the demo directory; `pin-login` is the actual sign-in and is always available. Neither
 * returns a PIN or a hash. Public (no guard) — this is the entry point before any session exists.
 */
@Controller('auth')
export class PinController {
  constructor(private readonly pinAuth: PinAuthService) {}

  /**
   * The name-picker's list: names, roles and site. No PINs, no hashes.
   *
   * It used to ride on DEV_LOGIN_ENABLED, from when PIN sign-in was a local convenience. It is now the
   * ONLY way anyone signs in — there is no password form — so a deployment without it is a sign-in
   * screen that cannot sign anyone in. Hence its own switch, deliberately separate: DEV_LOGIN_ENABLED
   * also arms /auth/dev-login (which mints an OWNER token) and permissive CORS, and neither of those
   * may ever be on in production.
   *
   * ⚠️ WHAT THIS EXPOSES, and it is more than names. Each entry carries the `userId` that
   * `pin-login` takes, so publishing this hands an attacker the identifiers to aim at. Against a
   * 4-digit PIN with 5 attempts per 15 minutes that is ~480 guesses per person per day into a
   * 10,000-wide space — days, not years, for a determined attacker on one account. The lockout is the
   * only thing standing in the way. Raised for review: the fix is longer PINs or a second factor for
   * OWNER, not hiding the list.
   */
  @Get('pin-directory')
  directory(): Promise<PinDirectoryEntry[]> {
    const open =
      process.env.DEV_LOGIN_ENABLED === 'true' || process.env.PIN_DIRECTORY_PUBLIC === 'true';
    if (!open) {
      throw new ForbiddenException('PIN directory is not available');
    }
    return this.pinAuth.directory();
  }

  @Post('pin-login')
  @HttpCode(200)
  pinLogin(@Body() dto: PinLoginDto): Promise<PinLoginResult> {
    return this.pinAuth.pinLogin(dto.userId, dto.pin);
  }

  /**
   * Whether the sign-in screen should ask for a PIN. Public and deliberately boring — it reveals only
   * which of two sign-in screens to draw, and lying to it would get nobody in: `open-login` re-checks
   * the same gate before it mints anything.
   */
  @Get('mode')
  mode(): { pinsRequired: boolean } {
    return { pinsRequired: PinAuthService.pinsRequired() };
  }

  /** Sign in without a PIN. 403 unless PIN checks are switched off — see PinAuthService.pinsRequired. */
  @Post('open-login')
  @HttpCode(200)
  openLogin(@Body() dto: OpenLoginDto): Promise<PinLoginResult> {
    return this.pinAuth.openLogin(dto.userId);
  }
}
