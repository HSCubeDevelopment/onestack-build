import { IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { REPAIR_PHASES, RepairPhase } from '../repair-photos';

/** Add a Before/During/After photo to a car (attaches to its current job). Base64 in JSON, like the rest. */
export class AddVehiclePhotoDto {
  @IsIn(REPAIR_PHASES as unknown as string[])
  phase!: RepairPhase;

  @IsString()
  @MinLength(1)
  dataBase64!: string;

  /** Defaults to image/jpeg (what the client's compressor emits). */
  @IsOptional()
  @IsString()
  contentType?: string;

  /** Optionally target a specific job of the car; otherwise the current job is used. */
  @IsOptional()
  @IsUUID()
  jobId?: string;
}
