import { IsArray, IsBoolean, IsObject, IsOptional, IsString, MinLength } from 'class-validator';

/** Create an intake form (Phase 3). Field defs are validated in the service (validateFields). */
export class CreateIntakeFormDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsArray()
  fields!: unknown[];
}

/** Edit an intake form. */
export class UpdateIntakeFormDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsArray()
  fields?: unknown[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** Submit a completed form against a customer. */
export class SubmitIntakeDto {
  @IsObject()
  answers!: Record<string, unknown>;
}
