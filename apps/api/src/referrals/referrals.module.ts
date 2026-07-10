import { Module } from '@nestjs/common';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';

/** Referral engine (Phase 4, card #231). Owns referral code + referral tables; TenantService is global. */
@Module({
  controllers: [ReferralsController],
  providers: [ReferralsService],
})
export class ReferralsModule {}
