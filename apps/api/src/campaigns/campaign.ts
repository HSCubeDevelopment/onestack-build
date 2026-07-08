/**
 * Pure marketing-campaign logic (Phase 3). No DB — cheap to unit test. Validates the channel and selects
 * the recipients from a segment who have a usable address for that channel (email for email, phone for sms).
 */

export type CampaignChannel = 'email' | 'sms';
export const CAMPAIGN_CHANNELS: readonly CampaignChannel[] = ['email', 'sms'] as const;

export function isChannel(s: unknown): s is CampaignChannel {
  return typeof s === 'string' && (CAMPAIGN_CHANNELS as readonly string[]).includes(s);
}

export interface AudienceContact {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
}

export interface Recipient {
  contactId: string;
  displayName: string;
  address: string;
}

/** The recipients from a segment reachable on the given channel (have an email / phone). */
export function selectRecipients(
  contacts: AudienceContact[],
  channel: CampaignChannel,
): Recipient[] {
  const out: Recipient[] = [];
  for (const c of contacts) {
    const address = channel === 'email' ? c.email : c.phone;
    if (address && address.trim()) {
      out.push({ contactId: c.id, displayName: c.displayName, address: address.trim() });
    }
  }
  return out;
}
