// Unit tests for the pure campaign logic + the no-op sender (Phase 3). No DB.
import { describe, expect, it } from 'vitest';
import { AudienceContact, isChannel, selectRecipients } from './campaign';
import { NoopCampaignSender } from './campaign-sender';

const contacts: AudienceContact[] = [
  { id: 'c1', displayName: 'Has Both', email: 'a@x.com', phone: '0400111222' },
  { id: 'c2', displayName: 'Email Only', email: 'b@x.com', phone: null },
  { id: 'c3', displayName: 'Phone Only', email: null, phone: '0400333444' },
  { id: 'c4', displayName: 'Neither', email: null, phone: '  ' },
];

describe('isChannel', () => {
  it('accepts email/sms and rejects others', () => {
    expect(isChannel('email')).toBe(true);
    expect(isChannel('sms')).toBe(true);
    expect(isChannel('carrier-pigeon')).toBe(false);
  });
});

describe('selectRecipients', () => {
  it('picks contacts reachable by email', () => {
    expect(selectRecipients(contacts, 'email').map((r) => r.contactId)).toEqual(['c1', 'c2']);
  });
  it('picks contacts reachable by sms', () => {
    const r = selectRecipients(contacts, 'sms');
    expect(r.map((x) => x.contactId)).toEqual(['c1', 'c3']);
    expect(r[0]?.address).toBe('0400111222');
  });
});

describe('NoopCampaignSender', () => {
  it('delivers nothing and says why', async () => {
    const res = await new NoopCampaignSender().send();
    expect(res.delivered).toBe(false);
    expect(res.sentCount).toBe(0);
    expect(res.reason).toMatch(/no email\/sms provider/i);
  });
});
