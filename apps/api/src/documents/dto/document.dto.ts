import {
  IsBoolean,
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MAX_SIGNED_NAME_CHARS } from '../esignature-provider';

/** Owner: generate a document by rendering a template with data. */
export class GenerateDocumentDto {
  @IsString()
  @MinLength(1)
  type!: string;

  @IsString()
  @MinLength(1)
  parentType!: string;

  @IsString()
  @MinLength(1)
  parentId!: string;

  @IsString()
  @MinLength(1)
  templateRef!: string;

  @IsString()
  @MaxLength(20000)
  body!: string;

  @IsObject()
  data!: Record<string, unknown>;
}

/** Owner: request an e-signature on a document. */
export class RequestSignatureDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  signerName!: string;

  @IsOptional()
  @IsEmail()
  signerEmail?: string;
}

/** PUBLIC: sign (typed-name acknowledgement) or decline. Untrusted input — length-capped + honeypot. */
export class SignDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SIGNED_NAME_CHARS)
  signedName?: string;

  @IsOptional()
  @IsBoolean()
  decline?: boolean;

  /** Honeypot — real signers never fill this; bots do. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}
