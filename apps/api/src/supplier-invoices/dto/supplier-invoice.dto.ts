import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** One captured line — what a supplier charged, by quantity and unit price. */
export class SupplierInvoiceLineDto {
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

/** Capture a supplier invoice against a job (Phase 2). */
export class CreateSupplierInvoiceDto {
  @IsOptional()
  @IsUUID('4')
  supplierContactId?: string;

  @IsString()
  @MinLength(1)
  invoiceNumber!: string;

  @IsOptional()
  @IsString()
  invoiceDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SupplierInvoiceLineDto)
  lines!: SupplierInvoiceLineDto[];
}

/** Edit the invoice header while it's a draft. */
export class UpdateSupplierInvoiceDto {
  @IsOptional()
  @IsUUID('4')
  supplierContactId?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  invoiceNumber?: string;

  @IsOptional()
  @IsString()
  invoiceDate?: string | null;

  @IsOptional()
  @IsString()
  notes?: string;
}

/** Edit a captured line while the invoice is a draft. */
export class EditSupplierInvoiceLineDto {
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

/** Ask OCR to read a scanned invoice attached to the job into a suggested draft. */
export class ScanSupplierInvoiceDto {
  @IsUUID('4')
  attachmentId!: string;
}
