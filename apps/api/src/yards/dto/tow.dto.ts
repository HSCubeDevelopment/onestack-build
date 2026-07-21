import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

/**
 * A tow collection (YRD-2). The driver has the car in front of them, so the car basics and the
 * customer's details are captured at pickup — a job needs both (the pack requires a customer on the
 * job and make/model/year on the vehicle). `pickupLocation` is a human-readable address the driver
 * enters/confirms; the device's GPS is never sent or stored (see the geofence privacy stance).
 */
export class CreateTowCollectionDto {
  @IsString() @MinLength(1) @MaxLength(20) rego!: string;
  @IsString() @MinLength(1) @MaxLength(60) make!: string;
  @IsString() @MinLength(1) @MaxLength(60) model!: string;
  @IsInt() @Min(1900) @Max(2100) year!: number;

  @IsString() @MinLength(1) @MaxLength(200) pickupLocation!: string;

  @IsString() @MinLength(1) @MaxLength(160) customerName!: string;
  @IsString() @MinLength(1) @MaxLength(40) customerPhone!: string;

  @IsOptional() @IsString() @MaxLength(500) comments?: string;
}
