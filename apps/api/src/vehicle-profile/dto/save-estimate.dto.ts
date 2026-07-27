import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';

class EstimatePhotoDto {
  @IsString()
  @MinLength(1)
  dataBase64!: string;

  @IsOptional()
  @IsString()
  contentType?: string;
}

/**
 * Save an AI photo-estimate against a car: a human-readable summary (persisted as a job note) plus the
 * photos it was based on (persisted as job attachments). Draft only — turning it into a formal quote is a
 * separate, owner-gated step.
 */
export class SaveEstimateDto {
  @IsString()
  @MinLength(1)
  summary!: string;

  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => EstimatePhotoDto)
  photos!: EstimatePhotoDto[];

  /** Optionally target a specific job of the car; otherwise the current job is used. */
  @IsOptional()
  @IsUUID()
  jobId?: string;
}
