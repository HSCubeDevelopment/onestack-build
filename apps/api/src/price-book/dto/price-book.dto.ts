import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePriceBookItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsIn(['labour', 'part'])
  type!: 'labour' | 'part';

  @IsIn(['hour', 'each'])
  unit!: 'hour' | 'each';

  @IsInt()
  @Min(0)
  defaultUnitPriceCents!: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  code?: string;
}

export class UpdatePriceBookItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsIn(['labour', 'part'])
  type?: 'labour' | 'part';

  @IsOptional()
  @IsIn(['hour', 'each'])
  unit?: 'hour' | 'each';

  @IsOptional()
  @IsInt()
  @Min(0)
  defaultUnitPriceCents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  code?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
