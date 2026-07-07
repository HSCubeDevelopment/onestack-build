/**
 * The vendor boundary for sharing a claim pack externally (Phase 2 — claim file). Producing a public,
 * shareable link (or emailing the pack to an insurer) needs deferred infrastructure — a storage/link
 * service or an email provider. The app is built right up to this seam: a `ClaimPackSharer` interface
 * plus a no-op default that shares nothing and says so. A real sharer drops in behind the same interface
 * later — no call-site changes. Until then, exporting the pack as a download works with no vendor.
 */

export interface ClaimPackRef {
  jobReference: string;
  claimNumber: string | null;
}

export interface ShareResult {
  shared: boolean;
  /** A link when shared; otherwise null. */
  url: string | null;
  /** Why it wasn't shared, when `shared` is false. */
  reason?: string;
}

export interface ClaimPackSharer {
  share(pack: ClaimPackRef): Promise<ShareResult>;
}

/** Default sharer: shares nothing and says why. Swapped for a real link/email provider later. */
export class NoopClaimPackSharer implements ClaimPackSharer {
  async share(): Promise<ShareResult> {
    return {
      shared: false,
      url: null,
      reason: 'No sharing provider configured — export the pack as a download instead',
    };
  }
}

/** DI token for the configured sharer. */
export const CLAIM_PACK_SHARER = Symbol('CLAIM_PACK_SHARER');
