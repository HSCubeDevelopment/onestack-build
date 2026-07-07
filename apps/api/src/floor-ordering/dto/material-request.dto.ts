import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** One requested item — a material the job needs, by quantity. No price (that's the PO's job). */
export class MaterialRequestLineDto {
  @IsString()
  @MinLength(1)
  description!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

/** Raise a material request for a job (Phase 2 — floor ordering). */
export class CreateMaterialRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MaterialRequestLineDto)
  lines!: MaterialRequestLineDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}

/** A manager's approve/reject decision — an optional note explaining it. */
export class DecisionDto {
  @IsOptional()
  @IsString()
  note?: string;
}
