import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateWebhookDto {
  @IsUrl({ require_tld: false }) url!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) events?: string[];
}
