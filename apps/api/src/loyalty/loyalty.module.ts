import { Module } from '@nestjs/common';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';

/** Loyalty, rewards & gift cards (Phase 4, card #230). Ledgers only; TenantService is global. */
@Module({
  controllers: [LoyaltyController],
  providers: [LoyaltyService],
})
export class LoyaltyModule {}
