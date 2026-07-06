import { IsEmail, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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

  @IsOptional()
  @IsObject()
  fields?: Record<string, unknown>;

  // Values for the shop's custom fields (card #11). Validated against the tenant's definitions.
  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;
}
