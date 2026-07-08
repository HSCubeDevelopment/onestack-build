import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Owner: request a review for a job (optionally tied to a customer). */
export class RequestReviewDto {
  @IsOptional()
  @IsUUID('4')
  contactId?: string;
}

/** Owner: show/hide a review. */
export class PublishReviewDto {
  @IsBoolean()
  published!: boolean;
}

/** PUBLIC: submit a review. Untrusted input — length-capped. */
export class SubmitReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reviewerName?: string;
}
