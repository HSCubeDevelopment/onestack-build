import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class DefineCustomFieldDto {
  @IsIn(['customer', 'vehicle'])
  appliesTo!: 'customer' | 'vehicle';

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string;

  @IsIn(['text', 'number', 'date', 'select', 'boolean'])
  type!: 'text' | 'number' | 'date' | 'select' | 'boolean';

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];
}

export class UpdateCustomFieldDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  options?: string[];
}
