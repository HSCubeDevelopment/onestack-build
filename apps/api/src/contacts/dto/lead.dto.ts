import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateLeadFormDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;
}

export class SetLeadFormEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}

/** PUBLIC, untrusted input. Length caps bound abuse; `website` is a honeypot (must stay empty). */
export class PublicLeadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  phone!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  vehicleInfo?: string;

  // Honeypot: real users never see or fill this; bots do. Whitelisted so the pipe doesn't 400 on it.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}

export class SetLeadStatusDto {
  @IsIn(['New', 'Contacted'])
  status!: 'New' | 'Contacted';
}
