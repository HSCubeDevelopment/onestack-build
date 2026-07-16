import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class OpenSaleDto {
  @IsOptional() @IsUUID('4') contactId?: string;
}
export class AddSaleLineDto {
  @IsString() @MinLength(1) @MaxLength(200) description!: string;
  @IsInt() @Min(1) quantity!: number;
  @IsInt() @Min(0) unitPriceCents!: number;
}
export class CompleteSaleDto {
  @IsIn(['cash', 'card', 'other']) tenderType!: 'cash' | 'card' | 'other';
}
