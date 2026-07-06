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

/** Card #21 — assign (or clear) the staff working a job. Empty array = unassigned. */
export class AssignDto {
  @IsArray()
  @IsUUID('4', { each: true })
  assignees!: string[];
}

/** Card #21 — add a running note to a job. */
export class AddNoteDto {
  @IsString()
  @MinLength(1)
  body!: string;
}

/** Card #21 — upload a photo/file to a job (base64 payload; validated server-side). */
export class AddAttachmentDto {
  @IsString()
  @MinLength(1)
  fileName!: string;

  @IsString()
  @MinLength(1)
  contentType!: string;

  @IsString()
  @MinLength(1)
  dataBase64!: string;

  @IsOptional()
  @IsString()
  caption?: string;
}
