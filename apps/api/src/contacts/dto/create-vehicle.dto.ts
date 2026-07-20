import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Vehicle input for the automotive pack. Format (rego pattern, VIN length) is re-validated against the
 * pack's Zod schema in SubjectService — this DTO is the first, friendly gate. */
export class CreateVehicleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(7)
  rego!: string;

  @IsOptional()
  @IsString()
  vin?: string;

  /** Manufacturer paint code from the compliance plate (card 10.1) — needed to mix paint, and the one
   * vehicle detail that cannot be derived from the rego. Format varies by manufacturer, so length only. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  paintCode?: string;

  @IsString()
  @MinLength(1)
  make!: string;

  @IsString()
  @MinLength(1)
  model!: string;

  @IsInt()
  @Min(1900)
  @Max(2100)
  year!: number;

  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;
}
