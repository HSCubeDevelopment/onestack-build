// Unit tests for the pure scope→parts logic (Phase 2 flagship, slice B): price-book matching and the
// derivation of the parts list. No DB — the DB-backed service is covered by the integration test.
import { describe, expect, it } from 'vitest';
import { matchPriceBookPart, partsFromScope, PriceBookPart } from './parts-from-scope';

const book: PriceBookPart[] = [
  { id: 'p1', name: 'Front bumper', defaultUnitPriceCents: 42000 },
  { id: 'p2', name: 'Headlight assembly', defaultUnitPriceCents: 68000 },
];

describe('matchPriceBookPart', () => {
  it('matches case-insensitively on exact name', () => {
    expect(matchPriceBookPart('front BUMPER', book)?.id).toBe('p1');
  });

  it('falls back to a substring match either direction', () => {
    // panel is more specific than the item name
    expect(matchPriceBookPart('Front bumper bar', book)?.id).toBe('p1');
    // panel is less specific than the item name
    expect(matchPriceBookPart('Headlight', book)?.id).toBe('p2');
  });

  it('returns null when nothing matches or the panel is blank', () => {
    expect(matchPriceBookPart('Rear door', book)).toBeNull();
    expect(matchPriceBookPart('   ', book)).toBeNull();
  });
});

describe('partsFromScope', () => {
  const scope = [
    { panel: 'Front bumper', operation: 'replace' as const, note: 'cracked' },
    { panel: 'Bonnet', operation: 'repair' as const },
    { panel: 'Rear door', operation: 'replace' as const },
    { panel: 'Guard', operation: 'paint' as const },
  ];

  it('only turns "replace" panels into parts (repair/paint are labour, out of MVP scope)', () => {
    const parts = partsFromScope(scope, book);
    expect(parts).toHaveLength(2);
    expect(parts.map((p) => p.description)).toEqual(['Front bumper — cracked', 'Rear door']);
  });

  it('prices matched parts from the book and leaves unmatched at 0', () => {
    const parts = partsFromScope(scope, book);
    expect(parts[0]).toMatchObject({ unitPriceCents: 42000, priceBookItemId: 'p1', quantity: 1 });
    expect(parts[1]).toMatchObject({ unitPriceCents: 0, priceBookItemId: null, quantity: 1 });
  });

  it('yields an empty list when the scope has no replaceable panels', () => {
    expect(partsFromScope([{ panel: 'Roof', operation: 'paint' }], book)).toEqual([]);
  });
});
