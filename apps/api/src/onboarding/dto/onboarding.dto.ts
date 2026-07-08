import { IsArray, IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/** Owner: import customers from CSV text or a pre-parsed rows array. */
export class ImportContactsDto {
  @IsOptional()
  @IsString()
  @MaxLength(500_000)
  csv?: string;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  rows?: Array<Record<string, string>>;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
