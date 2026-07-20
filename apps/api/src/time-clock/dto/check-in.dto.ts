import { Type } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * A position from the browser's Geolocation API (card 53.1).
 *
 * These coordinates are used to compute a distance and then DISCARDED — nothing here is persisted.
 * See the comment on the TimeEntry model for why.
 */
export class PositionDto {
  @IsLatitude()
  latitude!: number;

  @IsLongitude()
  longitude!: number;

  /** The device's own error estimate in metres. A large value means a wifi fix, not true GPS. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracyMetres?: number;
}

export class CheckInDto {
  /** Omitted when the browser refuses or has no fix — the service treats that as "unavailable". */
  @IsOptional()
  @ValidateNested()
  @Type(() => PositionDto)
  position?: PositionDto;

  /**
   * Set only when checking in despite a failed geofence. Required in that case by the service, so the
   * owner's review queue is never a list of unexplained exceptions.
   */
  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(200)
  overrideReason?: string;
}
