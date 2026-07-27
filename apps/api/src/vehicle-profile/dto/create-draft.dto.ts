import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Start a draft car from just a registration, when the plate isn't found. Make/model can come later. */
export class CreateDraftVehicleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  rego!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  make?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  model?: string;
}
