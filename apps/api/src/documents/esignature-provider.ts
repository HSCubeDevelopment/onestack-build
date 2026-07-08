/**
 * E-signature provider boundary (card #143). A legally-binding, CERTIFIED e-signature (with audit trail,
 * identity checks, tamper-evidence) is done by a specialist vendor — DocuSign, Adobe Sign, etc. That is a
 * DEFERRED vendor. Until one is wired in, the built-in flow records a basic typed-name acknowledgement on
 * our own public sign page: usable and auditable, but NOT certified. This interface is the seam a real
 * provider drops into later; `certified` tells callers which they got. Nothing here auto-sends.
 */

export interface SignatureRequestInput {
  documentId: string;
  signerName: string;
  signerEmail?: string;
  /** The unguessable token our public sign page uses. */
  token: string;
}

export interface SignatureProviderResult {
  provider: string;
  /** True only for a legally-binding certified provider; the built-in acknowledgement is false. */
  certified: boolean;
  /** A provider-side envelope/reference, when one exists. */
  externalRef?: string;
}

export interface ESignatureProvider {
  readonly name: string;
  request(input: SignatureRequestInput): Promise<SignatureProviderResult>;
}

/** DI token for the configured provider (a certified vendor when wired, the built-in acknowledgement otherwise). */
export const ESIGNATURE_PROVIDER = Symbol('ESIGNATURE_PROVIDER');

/**
 * Default provider: no external vendor. Signing happens on our own public page as a typed-name
 * acknowledgement — recorded and auditable, but explicitly NOT a certified/legally-binding e-signature.
 */
export class NoopESignatureProvider implements ESignatureProvider {
  readonly name = 'noop';

  async request(_input: SignatureRequestInput): Promise<SignatureProviderResult> {
    return { provider: 'noop', certified: false };
  }
}

/** Cap the typed signature length on the public page (untrusted input). */
export const MAX_SIGNED_NAME_CHARS = 120;
