import {
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class CreateWorkItemDto {
  @IsString()
  @MinLength(1)
  type!: string;

  @IsOptional()
  @IsObject()
  fields?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  subjectIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  assignees?: string[];
}

export class UpdateWorkItemDto {
  @IsOptional()
  @IsObject()
  fields?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  assignees?: string[];

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class TransitionDto {
  @IsString()
  @MinLength(1)
  event!: string;
}
