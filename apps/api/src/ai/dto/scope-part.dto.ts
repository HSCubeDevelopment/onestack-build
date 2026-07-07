import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

/** Add a part to the list by hand (Phase 2 flagship, slice B). Price may be 0 until the estimator sets it. */
export class AddScopePartDto {
  @IsString()
  @MinLength(1)
  description!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  unitPriceCents?: number;
}

/** Edit a part in the list — the estimator's pricing/adjustment step. */
export class EditScopePartDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  unitPriceCents?: number;
}
