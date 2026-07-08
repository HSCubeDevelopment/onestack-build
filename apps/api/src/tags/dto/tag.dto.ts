import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

/** Create a tag (Phase 3 — segmentation & tagging). */
export class CreateTagDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  color?: string;
}

/** Rename / recolour a tag. */
export class UpdateTagDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  color?: string | null;
}

/** Assign a tag to a contact. */
export class AssignTagDto {
  @IsUUID('4')
  tagId!: string;
}
