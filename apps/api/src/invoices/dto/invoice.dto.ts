import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateInvoiceDto {
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class AddInvoiceLineDto {
  @IsString()
  @MinLength(1)
  description!: string;

  @IsIn(['labour', 'part'])
  type!: 'labour' | 'part';

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsInt()
  @Min(1)
  unitPriceCents!: number;

  @IsOptional()
  @IsIn(['GST', 'GST_FREE'])
  taxCode?: 'GST' | 'GST_FREE';
}

/** Card #40.5 — set the bill-to party (may differ from the served customer). */
export class SetPayerDto {
  @IsUUID()
  payerContactId!: string;
}

export class PortionDto {
  @IsOptional()
  @IsUUID()
  payerContactId?: string;

  @IsOptional()
  @IsString()
  payerName?: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsInt()
  @Min(1)
  amountCents!: number;
}

/** Card #40.5 — split an invoice across payers; portions must reconcile to the total. */
export class SetSplitDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PortionDto)
  portions!: PortionDto[];
}

/** Card #42 — one-call insured split: bill the insurer for the authorised amount, customer for the excess. */
export class ApplyExcessSplitDto {
  @IsUUID()
  primaryPayerContactId!: string;

  @IsInt()
  @Min(0)
  primaryAmountCents!: number;

  @IsInt()
  @Min(1)
  excessAmountCents!: number;

  @IsOptional()
  @IsUUID()
  excessPayerContactId?: string;

  @IsOptional()
  @IsString()
  excessPayerName?: string;
}

/** Card #40.5 — record money received against an invoice (optionally a specific portion). */
export class RecordPaymentDto {
  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsIn(['cash', 'bank_transfer', 'card', 'eftpos', 'other'])
  method!: string;

  @IsOptional()
  @IsUUID()
  portionId?: string;

  @IsOptional()
  @IsDateString()
  receivedAt?: string;
}
