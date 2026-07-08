/**
 * The vendor boundary for emailing/SMSing a review invite (Phase 3). Sending needs a deferred provider,
 * so the app is built up to this seam: a `ReviewInviteSender` interface + a no-op default that sends
 * nothing and says why. A real email/SMS provider drops in behind the same interface later. Never auto-sends.
 */

export interface ReviewInvite {
  reviewId: string;
  token: string;
  contactId: string | null;
}

export interface InviteResult {
  sent: boolean;
  reason?: string;
}

export interface ReviewInviteSender {
  send(invite: ReviewInvite): Promise<InviteResult>;
}

/** Default: sends nothing and says why. Swapped for a real email/SMS provider later. */
export class NoopReviewInviteSender implements ReviewInviteSender {
  async send(): Promise<InviteResult> {
    return {
      sent: false,
      reason: 'No email/SMS provider configured — invite not sent (share the link manually)',
    };
  }
}

export const REVIEW_INVITE_SENDER = Symbol('REVIEW_INVITE_SENDER');
