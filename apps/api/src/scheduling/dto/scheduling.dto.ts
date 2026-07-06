import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateResourceDto {
  @IsIn(['bay', 'technician'])
  type!: 'bay' | 'technician';

  @IsString()
  @MinLength(1)
  name!: string;
}

export class UpdateResourceDto {
  @IsString()
  @MinLength(1)
  name!: string;
}

export class CreateBookingDto {
  @IsUUID()
  resourceId!: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @IsUUID()
  workItemId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  allowOverlap?: boolean;
}

export class UpdateBookingDto {
  @IsOptional()
  @IsUUID()
  resourceId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsUUID()
  workItemId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  allowOverlap?: boolean;
}
