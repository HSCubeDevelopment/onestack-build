import {
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateYardDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  /** A yard's fixed location, used to suggest the nearest yard. Optional — a yard can be added first. */
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;
}

export class UpdateYardDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;
}

export class CreateYardDropDto {
  @IsUUID('4')
  yardId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  rego!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comments?: string;
}
