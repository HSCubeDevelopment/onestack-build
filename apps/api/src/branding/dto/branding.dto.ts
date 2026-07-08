import { IsHexColor, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Owner: create/update the tenant brand. Every field optional except businessName on first setup. */
export class UpsertBrandDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  businessName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  tagline?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  logoUrl?: string | null;

  @IsOptional()
  @IsHexColor()
  primaryColor?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  contactPhone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactEmail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  websiteUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  addressText?: string | null;
}
