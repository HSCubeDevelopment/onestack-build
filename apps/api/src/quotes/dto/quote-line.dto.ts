import { IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

// @Min(1) enforces the card's "zero or negative quantity/price → blocked" at the edge.
export class AddQuoteLineDto {
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

/** Card #33 — move a quote along Draft → Sent → Accepted|Declined. */
export class SetQuoteStatusDto {
  @IsIn(['Sent', 'Accepted', 'Declined'])
  status!: 'Sent' | 'Accepted' | 'Declined';
}

export class EditQuoteLineDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;

  @IsOptional()
  @IsIn(['labour', 'part'])
  type?: 'labour' | 'part';

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  unitPriceCents?: number;

  @IsOptional()
  @IsIn(['GST', 'GST_FREE'])
  taxCode?: 'GST' | 'GST_FREE';
}
