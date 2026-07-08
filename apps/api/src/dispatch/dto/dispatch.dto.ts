import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { DISPATCH_STATUSES, DispatchStatus } from '../dispatch';

/** Set a job's dispatch status + optional manual ETA. */
export class SetDispatchDto {
  @IsIn(DISPATCH_STATUSES as unknown as string[])
  status!: DispatchStatus;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  etaAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}
