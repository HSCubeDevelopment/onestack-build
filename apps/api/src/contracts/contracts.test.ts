import { describe, expect, it } from 'vitest';
import { ContactContract } from './contact.contract';
import { ContactCreatedEvent } from './events';

describe('Contact contract', () => {
  it('accepts a valid contact', () => {
    const ok = ContactContract.safeParse({
      id: '11111111-1111-1111-1111-111111111111',
      displayName: 'Casey',
      email: 'casey@example.com',
      phone: null,
      address: null,
      fields: {},
      customFields: {},
      createdAt: new Date(),
    });
    expect(ok.success).toBe(true);
  });

  it('accepts a contact carrying a postal address (card 10.1)', () => {
    const ok = ContactContract.safeParse({
      id: '11111111-1111-1111-1111-111111111111',
      displayName: 'Amelia',
      email: null,
      phone: '0400111222',
      address: { line1: '12 Sydney Road', suburb: 'Coburg', state: 'VIC', postcode: '3058' },
      fields: {},
      customFields: {},
      createdAt: new Date(),
    });
    expect(ok.success).toBe(true);
  });

  it('rejects a bad uuid and a bad email', () => {
    expect(
      ContactContract.safeParse({
        id: 'nope',
        displayName: 'x',
        email: null,
        phone: null,
        createdAt: new Date(),
      }).success,
    ).toBe(false);
    expect(
      ContactContract.safeParse({
        id: '11111111-1111-1111-1111-111111111111',
        displayName: 'x',
        email: 'not-an-email',
        phone: null,
        createdAt: new Date(),
      }).success,
    ).toBe(false);
  });
});

describe('ContactCreated event contract', () => {
  const base = {
    id: '22222222-2222-2222-2222-222222222222',
    type: 'contact.created' as const,
    tenantId: '33333333-3333-3333-3333-333333333333',
    occurredAt: '2026-07-03T00:00:00.000Z',
    version: 1 as const,
    payload: { contactId: '44444444-4444-4444-4444-444444444444', displayName: 'Casey' },
  };

  it('accepts a well-formed event', () => {
    expect(ContactCreatedEvent.safeParse(base).success).toBe(true);
  });

  it('rejects a wrong type or malformed payload', () => {
    expect(ContactCreatedEvent.safeParse({ ...base, type: 'contact.updated' }).success).toBe(false);
    expect(ContactCreatedEvent.safeParse({ ...base, payload: { contactId: 'x' } }).success).toBe(
      false,
    );
    expect(ContactCreatedEvent.safeParse({ ...base, tenantId: 'not-a-uuid' }).success).toBe(false);
  });
});
