import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateItemDto {
  @IsString() @MinLength(1) @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(80) sku?: string;
  @IsOptional() @IsString() @MaxLength(40) unit?: string;
  @IsOptional() @IsInt() quantityOnHand?: number;
  @IsOptional() @IsInt() reorderLevel?: number;
  @IsOptional() @IsInt() unitCostCents?: number;
}

export class UpdateItemDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(80) sku?: string | null;
  @IsOptional() @IsString() @MaxLength(40) unit?: string | null;
  @IsOptional() @IsInt() reorderLevel?: number;
  @IsOptional() @IsInt() unitCostCents?: number | null;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class AdjustStockDto {
  @IsInt() delta!: number;
  @IsOptional() @IsIn(['receive', 'use', 'adjust']) reason?: 'receive' | 'use' | 'adjust';
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
