import { Module } from '@nestjs/common';
import { TagsModule } from '../tags/tags.module';
import { CampaignController } from './campaign.controller';
import { CampaignService } from './campaign.service';
import { CAMPAIGN_SENDER, CampaignSender, NoopCampaignSender } from './campaign-sender';

/**
 * Marketing campaigns (Phase 3). One-shot segmented email/SMS campaigns targeting a tag/segment (reuses
 * TagsModule). Delivery is a vendor boundary (no-op by default). Drip sequences + win-back are a follow-up.
 */
@Module({
  imports: [TagsModule],
  controllers: [CampaignController],
  providers: [
    CampaignService,
    {
      provide: CAMPAIGN_SENDER,
      useFactory: (): CampaignSender => new NoopCampaignSender(),
    },
  ],
})
export class CampaignsModule {}
