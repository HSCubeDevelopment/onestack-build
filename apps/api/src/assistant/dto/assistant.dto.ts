import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { MAX_QUESTION_CHARS } from '../assistant-adapter';

/** Ask the assistant to DRAFT a reply. Optional job/customer ground the draft. */
export class AskAssistantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_QUESTION_CHARS)
  question!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  context?: string;

  @IsOptional()
  @IsUUID('4')
  workItemId?: string;

  @IsOptional()
  @IsUUID('4')
  contactId?: string;
}
