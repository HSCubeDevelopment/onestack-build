import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { CAMPAIGN_CHANNELS, CampaignChannel } from '../campaign';

/** Create a marketing campaign (Phase 3). */
export class CreateCampaignDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsIn(CAMPAIGN_CHANNELS as unknown as string[])
  channel!: CampaignChannel;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  body?: string;

  @IsOptional()
  @IsUUID('4')
  tagId?: string;
}

/** Edit a draft campaign. */
export class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(CAMPAIGN_CHANNELS as unknown as string[])
  channel?: CampaignChannel;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  body?: string;

  @IsOptional()
  @IsUUID('4')
  tagId?: string | null;
}
