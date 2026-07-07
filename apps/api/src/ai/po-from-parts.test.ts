// Unit tests for the pure PO logic (Phase 2 flagship, slice C): seeding PO lines from parts and totalling
// their expected cost. No DB — the DB-backed service is covered by the integration test.
import { describe, expect, it } from 'vitest';
import { poLinesFromParts, poTotalCents } from './po-from-parts';
import { NoopPurchaseOrderSender } from './purchase-order-sender';

describe('poLinesFromParts', () => {
  it('makes one PO line per part, carrying provenance back to the scope part', () => {
    const lines = poLinesFromParts([
      { id: 's1', description: 'Front bumper', quantity: 1, unitPriceCents: 42000 },
      { id: 's2', description: 'Headlight', quantity: 2, unitPriceCents: 68000 },
    ]);
    expect(lines).toEqual([
      { description: 'Front bumper', quantity: 1, unitPriceCents: 42000, scopePartId: 's1' },
      { description: 'Headlight', quantity: 2, unitPriceCents: 68000, scopePartId: 's2' },
    ]);
  });

  it('yields no lines for an empty parts list', () => {
    expect(poLinesFromParts([])).toEqual([]);
  });
});

describe('poTotalCents', () => {
  it('sums quantity × unit cost across lines', () => {
    expect(
      poTotalCents([
        { quantity: 1, unitPriceCents: 42000 },
        { quantity: 2, unitPriceCents: 68000 },
      ]),
    ).toBe(178000);
  });

  it('is 0 for no lines', () => {
    expect(poTotalCents([])).toBe(0);
  });
});

describe('NoopPurchaseOrderSender', () => {
  it('never delivers and says why (nothing is auto-sent)', async () => {
    const result = await new NoopPurchaseOrderSender().send();
    expect(result.delivered).toBe(false);
    expect(result.reason).toMatch(/no email provider/i);
  });
});
