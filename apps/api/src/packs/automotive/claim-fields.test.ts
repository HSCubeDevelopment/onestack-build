// Card #15: the insurance-claim block on an automotive job is pack config (zod). These pin its shape.
import { describe, expect, it } from 'vitest';
import { ClaimFields } from './automotive.pack';

describe('ClaimFields (card #15)', () => {
  it('accepts a full claim and defaults billPayer to insurer', () => {
    const parsed = ClaimFields.parse({
      insurer: 'AAMI',
      insurerContactId: '11111111-1111-4111-8111-111111111111',
      claimNumber: 'CLM-001',
      assessor: 'J. Smith',
      dateLodged: '2026-07-01',
      authorisedAmountCents: 123000,
      excessCents: 2000,
    });
    expect(parsed.billPayer).toBe('insurer');
    expect(parsed.excessCents).toBe(2000);
  });

  it('accepts a minimal claim (insurer + claim number only)', () => {
    const parsed = ClaimFields.parse({ insurer: 'RACV', claimNumber: 'X1' });
    expect(parsed.insurer).toBe('RACV');
  });

  it('rejects a missing insurer / claim number and negative money', () => {
    expect(ClaimFields.safeParse({ claimNumber: 'X1' }).success).toBe(false);
    expect(ClaimFields.safeParse({ insurer: 'RACV' }).success).toBe(false);
    expect(
      ClaimFields.safeParse({ insurer: 'RACV', claimNumber: 'X1', excessCents: -5 }).success,
    ).toBe(false);
  });

  it('rejects an unknown bill payer', () => {
    expect(
      ClaimFields.safeParse({ insurer: 'RACV', claimNumber: 'X1', billPayer: 'medicare' }).success,
    ).toBe(false);
  });
});
