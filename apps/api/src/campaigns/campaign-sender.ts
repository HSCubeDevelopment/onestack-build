import { CampaignChannel, Recipient } from './campaign';

/**
 * The vendor boundary for delivering a campaign (Phase 3). Email/SMS sending needs a deferred provider, so
 * the app is built up to this seam: a `CampaignSender` interface + a no-op default that delivers nothing
 * and says why. A real provider (SendGrid / Twilio / SES) drops in behind the same interface later — no
 * call-site changes. Honours the golden rule: never auto-send.
 */

export interface CampaignMessage {
  channel: CampaignChannel;
  subject: string | null;
  body: string;
  recipients: Recipient[];
}

export interface SendResult {
  delivered: boolean;
  /** How many messages were actually handed to a provider. */
  sentCount: number;
  reason?: string;
}

export interface CampaignSender {
  send(message: CampaignMessage): Promise<SendResult>;
}

/** Default sender: delivers nothing and says why. Swapped for a real email/SMS provider later. */
export class NoopCampaignSender implements CampaignSender {
  async send(): Promise<SendResult> {
    return {
      delivered: false,
      sentCount: 0,
      reason: 'No email/SMS provider configured — nothing sent',
    };
  }
}

export const CAMPAIGN_SENDER = Symbol('CAMPAIGN_SENDER');
