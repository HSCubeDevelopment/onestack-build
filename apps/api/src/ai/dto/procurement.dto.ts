import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { PART_GRADES, PROCUREMENT_STATUSES } from '../parts-procurement';

/** Card 62.1 — supplier / buy price / grade / ETA / status. All optional; fill in as you learn. */
export class SetProcurementDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  buyPriceCents?: number | null;

  @IsOptional()
  @IsIn(PART_GRADES)
  grade?: (typeof PART_GRADES)[number] | null;

  @IsOptional()
  @IsIn(PROCUREMENT_STATUSES)
  procurementStatus?: (typeof PROCUREMENT_STATUSES)[number];

  @IsOptional()
  @IsUUID('4')
  supplierContactId?: string | null;

  @IsOptional()
  @IsString()
  supplierPartNumber?: string | null;

  @IsOptional()
  @IsISO8601()
  expectedAt?: string | null;
}

/** Goods-received. A positive count, because receiving zero is not an event. */
export class ReceivePartDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity!: number;
}
