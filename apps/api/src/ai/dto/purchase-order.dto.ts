import { IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

/** Create a draft PO from the parts list, optionally naming the supplier (Phase 2 flagship, slice C). */
export class CreatePurchaseOrderDto {
  @IsOptional()
  @IsUUID('4')
  supplierContactId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

/** Edit the PO header while it's a draft. */
export class UpdatePurchaseOrderDto {
  @IsOptional()
  @IsUUID('4')
  supplierContactId?: string | null;

  @IsOptional()
  @IsString()
  notes?: string;
}

/** Add a line to a draft PO by hand. */
export class AddPoLineDto {
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

/** Edit a PO line while the PO is a draft. */
export class EditPoLineDto {
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
