import { IsISO8601, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class AddShiftDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  staffName!: string;

  @IsOptional()
  @IsUUID('4')
  staffUserId?: string;

  @IsOptional()
  @IsIn(['shift', 'time_off'])
  kind?: 'shift' | 'time_off';

  @IsISO8601()
  startsAt!: string;

  @IsISO8601()
  endsAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
