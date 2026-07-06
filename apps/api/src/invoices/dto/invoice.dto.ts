import { IsDateString, IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

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
