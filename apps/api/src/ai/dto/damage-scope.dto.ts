import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { DAMAGE_OPERATIONS, DamageOperation } from '../damage-analyzer';

/** One edited scope line. The estimator's confirmed view of a panel. */
export class DamageScopeItemDto {
  @IsString()
  @MinLength(1)
  panel!: string;

  @IsIn(DAMAGE_OPERATIONS as unknown as string[])
  operation!: DamageOperation;

  @IsOptional()
  @IsString()
  note?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number | null;
}

/** Edit the draft scope (PATCH /ai-scope/:id) — full replace of summary and/or items. */
export class EditDamageScopeDto {
  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DamageScopeItemDto)
  items?: DamageScopeItemDto[];
}
