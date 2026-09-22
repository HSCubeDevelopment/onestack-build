import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Booking a tow. The pickup address is TYPED by whoever books it — it is never a device position, so
 * the rule that a live GPS fix is never stored (0047/0048) is untouched.
 */
export class CreateTowJobDto {
  /** Who is going. Must hold the TOW role in this shop; the service rejects anyone else. */
  @IsUUID('4')
  driverUserId!: string;

  @IsUUID('4')
  destinationYardId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  pickupAddress!: string;

  // Capped at 7 alphanumerics to match VehicleFields in the automotive pack. The older tow DTO allows
  // 20, which fails validation one step later — after the Contact has already been written.
  @IsString()
  @MinLength(1)
  @MaxLength(7)
  rego!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  make!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  model!: string;

  @IsInt()
  @Min(1900)
  @Max(2100)
  year!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  customerName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  customerPhone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  pickupNotes?: string;
}
