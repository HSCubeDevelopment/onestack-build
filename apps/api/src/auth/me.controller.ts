import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Matches } from 'class-validator';
import { AuthContext } from './auth.types';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { MeProfile, PinAuthService } from './pin-auth.service';
import { AllowStaff } from './roles.decorator';
import { RolesGuard } from './roles.guard';

class ChangePinDto {
  @Matches(/^[0-9]{4}$/, { message: 'Current PIN must be 4 digits' })
  currentPin!: string;

  @Matches(/^[0-9]{4}$/, { message: 'New PIN must be 4 digits' })
  newPin!: string;
}

/**
 * The signed-in person acting on THEMSELVES: read their own profile/roster, and change their own PIN.
 * Gated (must be logged in) — CurrentUser scopes every call to the caller, so nobody can read or change
 * anyone else. Separate from the public PinController so the name-picker / login routes stay ungated.
 */
@Controller('auth')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MeController {
  constructor(private readonly pinAuth: PinAuthService) {}

  @AllowStaff()
  @Get('me')
  me(@CurrentUser() user: AuthContext): Promise<MeProfile> {
    return this.pinAuth.me(user.userId, user.role);
  }

  @AllowStaff()
  @Post('pin-change')
  changePin(@CurrentUser() user: AuthContext, @Body() dto: ChangePinDto): Promise<{ ok: true }> {
    return this.pinAuth.changeOwnPin(user.userId, dto.currentPin, dto.newPin);
  }
}
