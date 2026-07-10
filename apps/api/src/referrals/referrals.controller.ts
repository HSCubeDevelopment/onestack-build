import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ConvertReferralDto, CreateReferralDto, RewardReferralDto } from './dto/referrals.dto';
import { ReferralCodeView, ReferralsService, ReferralView } from './referrals.service';

/**
 * Referral engine — owner (Phase 4, card #231). Issue a customer's referral code, record referrals, and
 * track them pending → converted → rewarded. Tenant-scoped.
 */
@Controller('referrals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Post('codes/:contactId')
  code(@CurrentUser() user: AuthContext, @Param('contactId') contactId: string): Promise<ReferralCodeView> {
    return this.referrals.ensureCode(user.tenantId, contactId);
  }

  @Get()
  list(@CurrentUser() user: AuthContext): Promise<ReferralView[]> {
    return this.referrals.list(user.tenantId);
  }

  @Post()
  create(@CurrentUser() user: AuthContext, @Body() dto: CreateReferralDto): Promise<ReferralView> {
    return this.referrals.create(user.tenantId, dto);
  }

  @Post(':id/convert')
  convert(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: ConvertReferralDto,
  ): Promise<ReferralView> {
    return this.referrals.convert(user.tenantId, id, dto.referredContactId);
  }

  @Post(':id/reward')
  reward(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: RewardReferralDto,
  ): Promise<ReferralView> {
    return this.referrals.reward(user.tenantId, id, dto.note);
  }
}
