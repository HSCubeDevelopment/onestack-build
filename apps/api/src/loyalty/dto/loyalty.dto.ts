import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class AdjustPointsDto {
  @IsInt() delta!: number;
  @IsOptional() @IsString() @MaxLength(60) reason?: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class IssueGiftCardDto {
  @IsInt() @Min(1) initialCents!: number;
  @IsOptional() @IsString() @MaxLength(40) code?: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class RedeemGiftCardDto {
  @IsInt() @Min(1) amountCents!: number;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
