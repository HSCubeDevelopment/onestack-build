import { IsOptional, IsString, MaxLength, Matches } from 'class-validator';

/**
 * A postal address on a Contact (card 10.1).
 *
 * This lives in CORE, not the automotive pack, deliberately: every vertical's customer has an address —
 * it is not a vertical noun the way "insurer" or "rego" is. Contrast with insurer-on-file, which IS
 * automotive-specific and therefore goes through the custom-field framework instead (see the PR).
 *
 * Australian-shaped but not Australia-only: state and postcode are length-capped and pattern-checked
 * loosely rather than validated against a list, so the same schema still holds if the platform ships
 * outside AU. Every part is optional — a walk-in customer who gives only a suburb is still a valid
 * customer, and refusing to save them would be worse than storing a partial address.
 */
export class AddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  line1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  line2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  suburb?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  state?: string;

  /** 3–10 chars covers AU (4 digits) and most other postal formats without hard-coding a country. */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9 -]{2,9}$/, { message: 'postcode looks invalid' })
  postcode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  country?: string;
}
