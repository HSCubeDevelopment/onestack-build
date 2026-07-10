import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AdjustPointsDto, IssueGiftCardDto, RedeemGiftCardDto } from './dto/loyalty.dto';
import { GiftCardView, LoyaltyAccountView, LoyaltyService } from './loyalty.service';

/**
 * Loyalty, rewards & gift cards — owner (Phase 4, card #230). Points per customer + gift-card balances.
 * Ledgers only (no card payment processing). Tenant-scoped.
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get('loyalty/:contactId')
  account(@CurrentUser() user: AuthContext, @Param('contactId') contactId: string): Promise<LoyaltyAccountView> {
    return this.loyalty.getAccount(user.tenantId, contactId);
  }

  @Post('loyalty/:contactId/adjust')
  adjust(
    @CurrentUser() user: AuthContext,
    @Param('contactId') contactId: string,
    @Body() dto: AdjustPointsDto,
  ): Promise<LoyaltyAccountView> {
    return this.loyalty.adjustPoints(user.tenantId, contactId, dto.delta, dto.reason, dto.note);
  }

  @Post('gift-cards')
  issue(@CurrentUser() user: AuthContext, @Body() dto: IssueGiftCardDto): Promise<GiftCardView> {
    return this.loyalty.issueGiftCard(user.tenantId, dto);
  }

  @Get('gift-cards')
  list(@CurrentUser() user: AuthContext): Promise<GiftCardView[]> {
    return this.loyalty.listGiftCards(user.tenantId);
  }

  @Post('gift-cards/:id/redeem')
  redeem(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: RedeemGiftCardDto,
  ): Promise<GiftCardView> {
    return this.loyalty.redeemGiftCard(user.tenantId, id, dto.amountCents, dto.note);
  }

  @Post('gift-cards/:id/void')
  void(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<GiftCardView> {
    return this.loyalty.voidGiftCard(user.tenantId, id);
  }
}
