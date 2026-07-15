import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  FLEET_BOOKING_STATUSES,
  FLEET_MOVEMENT_STATUSES,
  FLEET_PHOTO_TYPES,
  FLEET_VEHICLE_STATUSES,
} from '../fleet.util';

// ------------------------------------------------------------------ vehicles

export class UpdateVehicleDto {
  @IsOptional() @IsString() @MaxLength(60) make?: string;
  @IsOptional() @IsString() @MaxLength(60) model?: string;
  @IsOptional() @IsString() @MaxLength(60) vehicleType?: string;
  @IsOptional() @IsIn(FLEET_VEHICLE_STATUSES) status?: string;
  @IsOptional() @IsBoolean() isCompanyCar?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

// ----------------------------------------------------------------- movements

export class CreateMovementDto {
  @IsOptional() @IsString() @MaxLength(160) driverName?: string;
  @IsOptional() @IsString() @MaxLength(40) driverPhone?: string;
  @IsOptional() @IsString() @MaxLength(160) ownerName?: string;
  @IsOptional() @IsString() @MaxLength(40) ownerPhone?: string;
  /** The customer's car coming in. */
  @IsOptional() @IsString() @MaxLength(20) carsInRego?: string;
  /** The fleet car going out. */
  @IsOptional() @IsString() @MaxLength(20) carsOutRego?: string;
  @IsOptional() @IsString() @MaxLength(40) purpose?: string;
  @IsOptional() @IsISO8601() movedAt?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsString() @MaxLength(160) staffName?: string;
  @IsOptional() @IsUUID('4') contactId?: string;
}

export class UpdateMovementDto {
  @IsOptional() @IsString() @MaxLength(160) driverName?: string;
  @IsOptional() @IsString() @MaxLength(40) driverPhone?: string;
  @IsOptional() @IsString() @MaxLength(160) ownerName?: string;
  @IsOptional() @IsString() @MaxLength(40) ownerPhone?: string;
  @IsOptional() @IsString() @MaxLength(20) carsInRego?: string;
  @IsOptional() @IsString() @MaxLength(20) carsOutRego?: string;
  @IsOptional() @IsString() @MaxLength(40) purpose?: string;
  @IsOptional() @IsISO8601() movedAt?: string;
  @IsOptional() @IsIn(FLEET_MOVEMENT_STATUSES) status?: string;
  @IsOptional() @IsBoolean() needsReview?: boolean;
  @IsOptional() @IsString() @MaxLength(200) reviewReason?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

// ------------------------------------------------------------------- returns

export class CreateReturnDto {
  @IsOptional() @IsString() @MaxLength(160) driverName?: string;
  @IsOptional() @IsString() @MaxLength(40) mobileNumber?: string;
  @IsString() @MaxLength(20) returnedRego!: string;
  @IsOptional() @IsISO8601() returnedAt?: string;
  @IsOptional() @IsString() @MaxLength(80) bondStatus?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsString() @MaxLength(160) staffName?: string;
  @IsOptional() @IsUUID('4') movementId?: string;
}

export class UpdateReturnDto {
  @IsOptional() @IsString() @MaxLength(160) driverName?: string;
  @IsOptional() @IsString() @MaxLength(40) mobileNumber?: string;
  @IsOptional() @IsISO8601() returnedAt?: string;
  @IsOptional() @IsString() @MaxLength(80) bondStatus?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsBoolean() needsReview?: boolean;
  @IsOptional() @IsString() @MaxLength(200) reviewReason?: string;
}

// ------------------------------------------------------------------ bookings

export class CreateBookingDto {
  @IsString() @MaxLength(20) vehicleRego!: string;
  @IsOptional() @IsString() @MaxLength(160) bookingName?: string;
  @IsOptional() @IsString() @MaxLength(40) bookingMobile?: string;
  @IsISO8601() startAt!: string;
  @IsOptional() @IsISO8601() expectedReturnAt?: string;
  @IsOptional() @IsString() @MaxLength(40) purpose?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsUUID('4') contactId?: string;
}

export class UpdateBookingDto {
  @IsOptional() @IsIn(FLEET_BOOKING_STATUSES) status?: string;
  @IsOptional() @IsISO8601() startAt?: string;
  @IsOptional() @IsISO8601() expectedReturnAt?: string;
  @IsOptional() @IsString() @MaxLength(40) purpose?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsString() @MaxLength(160) bookingName?: string;
  @IsOptional() @IsString() @MaxLength(40) bookingMobile?: string;
}

// -------------------------------------------------------------------- photos

export class AddFleetPhotoDto {
  @IsIn(FLEET_PHOTO_TYPES) photoType!: string;
  @IsString() dataBase64!: string;
  @IsOptional() @IsString() @MaxLength(120) contentType?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsOptional() @IsUUID('4') vehicleId?: string;
  @IsOptional() @IsUUID('4') movementId?: string;
  @IsOptional() @IsUUID('4') returnId?: string;
  @IsOptional() @IsUUID('4') bookingId?: string;
}
