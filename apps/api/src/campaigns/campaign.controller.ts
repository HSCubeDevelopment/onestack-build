import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CampaignService, CampaignView } from './campaign.service';
import { SendResult } from './campaign-sender';
import { CreateCampaignDto, UpdateCampaignDto } from './dto/campaign.dto';

/**
 * Marketing campaigns (Phase 3). Write a one-shot email/SMS campaign, target a tag/segment, preview the
 * audience, and send it (through the vendor boundary — no-op until a provider is wired). Tenant-scoped.
 */
@Controller('campaigns')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CampaignController {
  constructor(private readonly campaigns: CampaignService) {}

  @Post()
  create(@CurrentUser() user: AuthContext, @Body() dto: CreateCampaignDto): Promise<CampaignView> {
    return this.campaigns.create(user.tenantId, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthContext): Promise<CampaignView[]> {
    return this.campaigns.list(user.tenantId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<CampaignView> {
    return this.campaigns.get(user.tenantId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateCampaignDto,
  ): Promise<CampaignView> {
    return this.campaigns.update(user.tenantId, id, dto);
  }

  @Get(':id/audience')
  audience(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return this.campaigns.audience(user.tenantId, id);
  }

  /** Vendor boundary: sends the campaign if a provider is configured; otherwise reports nothing sent. */
  @Post(':id/send')
  send(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
  ): Promise<{ campaign: CampaignView; result: SendResult }> {
    return this.campaigns.send(user.tenantId, id);
  }
}
