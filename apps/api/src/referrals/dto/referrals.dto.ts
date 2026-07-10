import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateReferralDto {
  @IsUUID('4') referrerContactId!: string;
  @IsString() @MinLength(1) @MaxLength(120) referredName!: string;
  @IsOptional() @IsString() @MaxLength(40) referredPhone?: string;
}

export class ConvertReferralDto {
  @IsOptional() @IsUUID('4') referredContactId?: string;
}

export class RewardReferralDto {
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
