// Unit tests for the pure floor-ordering logic (Phase 2): line normalisation, the status machine, and
// the no-op order sender. No DB — the DB-backed service is covered by the integration test.
import { describe, expect, it } from 'vitest';
import { NoopMaterialOrderSender } from './material-order-sender';
import { canDecide, canOrder, normaliseLines } from './material-request';

const fail = (m: string) => new Error(m);

describe('normaliseLines', () => {
  it('trims and defaults quantity to 1', () => {
    expect(normaliseLines([{ description: '  Primer  ' }], fail)).toEqual([
      { description: 'Primer', quantity: 1, notes: null },
    ]);
  });

  it('keeps explicit quantity and notes', () => {
    expect(normaliseLines([{ description: 'Clear coat', quantity: 3, notes: '2K' }], fail)).toEqual(
      [{ description: 'Clear coat', quantity: 3, notes: '2K' }],
    );
  });

  it('rejects an empty list, blank description, or bad quantity', () => {
    expect(() => normaliseLines([], fail)).toThrow(/at least one line/i);
    expect(() => normaliseLines([{ description: '   ' }], fail)).toThrow(
      /description is required/i,
    );
    expect(() => normaliseLines([{ description: 'X', quantity: 0 }], fail)).toThrow(/quantity/i);
  });
});

describe('status machine', () => {
  it('only a pending request can be decided', () => {
    expect(canDecide('requested')).toBe(true);
    expect(canDecide('approved')).toBe(false);
    expect(canDecide('rejected')).toBe(false);
    expect(canDecide('ordered')).toBe(false);
  });

  it('only an approved request can be ordered', () => {
    expect(canOrder('approved')).toBe(true);
    expect(canOrder('requested')).toBe(false);
    expect(canOrder('ordered')).toBe(false);
  });
});

describe('NoopMaterialOrderSender', () => {
  it('emails nothing and says why (never auto-sends)', async () => {
    const result = await new NoopMaterialOrderSender().send();
    expect(result.emailed).toBe(false);
    expect(result.reason).toMatch(/no email provider/i);
  });
});
