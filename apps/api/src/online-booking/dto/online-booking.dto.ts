import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Owner: configure the shop's public booking page. */
export class UpsertBookingPageDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(480)
  slotMinutes?: number;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  resourceIds?: string[];
}

/** PUBLIC booking submission. Untrusted input — every field is length-capped; `website` is a honeypot. */
export class PublicBookDto {
  @IsUUID('4')
  resourceId!: string;

  @IsString()
  @MaxLength(40)
  startsAt!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  customerName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  customerPhone!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  customerEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}
