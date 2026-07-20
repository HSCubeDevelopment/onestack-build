import {
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AddressDto } from './address.dto';

export class CreateContactDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  displayName!: string;

  // Customer requires a phone (card #10). Core Contact is otherwise flexible.
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  /** Postal address (card 10.1). Core, not pack-specific — every vertical's customer has one. */
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;

  @IsOptional()
  @IsObject()
  fields?: Record<string, unknown>;

  // Values for the shop's custom fields (card #11). Validated against the tenant's definitions.
  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;
}
