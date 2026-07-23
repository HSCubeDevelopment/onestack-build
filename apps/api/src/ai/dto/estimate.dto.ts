import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MAX_ANALYSIS_IMAGES } from '../damage-analyzer';

/** One captured photo of the damage, base64-encoded (no data: prefix), matching the analyzer's input. */
export class EstimatePhotoDto {
  @IsString()
  @MaxLength(120)
  contentType!: string;

  @IsString()
  dataBase64!: string;
}

/**
 * Ask for an instant estimate from photos (POST /estimates/from-photos). Ephemeral — nothing is stored;
 * the response is a draft the employee edits on screen. Capped at the analyzer's photo limit to bound cost.
 */
export class EstimateFromPhotosDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ANALYSIS_IMAGES)
  @ValidateNested({ each: true })
  @Type(() => EstimatePhotoDto)
  photos!: EstimatePhotoDto[];

  /** Optional free-text the worker adds ("front-end hit, airbags didn't deploy"). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  /** Override the default labour rate for this estimate. Bounded to a sane panel-shop range. */
  @IsOptional()
  @IsNumber()
  @Min(20)
  @Max(500)
  labourRateAud?: number;
}
