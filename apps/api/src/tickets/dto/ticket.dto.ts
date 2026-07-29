import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MAX_TICKET_FILES } from '../ticket-extractor';

/** The set of statuses a ticket can be in. Kept here so the DTO and service share one source of truth. */
export const TICKET_STATUSES = ['open', 'paid', 'disputed', 'cancelled'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** One file to extract from or to store: a photo of the notice or the notice PDF. Base64 in JSON. */
export class TicketFileDto {
  @IsString()
  @MinLength(1)
  dataBase64!: string;

  /** MIME type — an image (jpeg/png/webp/gif) or application/pdf. */
  @IsString()
  @MinLength(1)
  contentType!: string;
}

/** Run AI extraction over one or more captured files. Returns an editable draft; saves nothing. */
export class ExtractTicketDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_TICKET_FILES)
  @ValidateNested({ each: true })
  @Type(() => TicketFileDto)
  files!: TicketFileDto[];
}

/**
 * Save a confirmed ticket. The web sends the human-reviewed extraction (flat fields) plus the rego it is
 * against and, optionally, the original file to keep. Everything except the rego is optional — a notice
 * with an odd layout should still save whatever the person could confirm. Amounts are whole cents.
 */
export class CreateTicketDto {
  @IsString()
  @MinLength(1)
  rego!: string;

  @IsOptional() @IsString() noticeType?: string;
  @IsOptional() @IsString() noticeNumber?: string;
  @IsOptional() @IsString() infringementNumber?: string;
  @IsOptional() @IsString() obligationNumber?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() agency?: string;
  @IsOptional() @IsString() offence?: string;
  @IsOptional() @IsString() offenceCode?: string;
  @IsOptional() @IsString() offenceDate?: string;
  @IsOptional() @IsString() offenceTime?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() issueDate?: string;
  @IsOptional() @IsString() dueDate?: string;
  @IsOptional() @IsString() recipientName?: string;
  @IsOptional() @IsString() recipientAbn?: string;
  @IsOptional() @IsString() recipientAddress?: string;
  @IsOptional() @IsString() notes?: string;

  @IsOptional() @IsInt() @Min(0) penaltyCents?: number;
  @IsOptional() @IsInt() @Min(0) feesCents?: number;
  @IsOptional() @IsInt() @Min(0) amountDueCents?: number;

  /** 'photo' | 'pdf' — how it was captured. Defaults to 'photo'. */
  @IsOptional()
  @IsIn(['photo', 'pdf'])
  source?: string;

  /** The full extraction object, kept verbatim for audit alongside the columned fields. */
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  /** The original notice (image or PDF) to keep in Storage. Optional — details can be saved without it. */
  @IsOptional()
  @ValidateNested()
  @Type(() => TicketFileDto)
  file?: TicketFileDto;
}

/** Change a ticket's status (mark paid / disputed / cancelled). */
export class UpdateTicketDto {
  @IsIn(TICKET_STATUSES as unknown as string[])
  status!: TicketStatus;
}
