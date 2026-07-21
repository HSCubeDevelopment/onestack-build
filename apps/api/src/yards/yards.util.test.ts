import { describe, expect, it } from 'vitest';
import { haversineMetres, nearestYardId, normRego, YARD_DROP_STATUSES } from './yards.util';

describe('normRego', () => {
  it('uppercases and strips non-alphanumerics', () => {
    expect(normRego('1pi3xz ')).toBe('1PI3XZ');
    expect(normRego('ab-c 123')).toBe('ABC123');
    expect(normRego(null)).toBe('');
    expect(normRego(undefined)).toBe('');
  });
});

describe('haversineMetres', () => {
  it('is zero at the same point', () => {
    const p = { latitude: -37.68, longitude: 145.01 };
    expect(haversineMetres(p, p)).toBe(0);
  });

  it('measures a ~1km north offset within a few metres', () => {
    const a = { latitude: -37.68, longitude: 145.01 };
    const b = { latitude: -37.68 + 1000 / 111_320, longitude: 145.01 };
    expect(haversineMetres(a, b)).toBeGreaterThan(995);
    expect(haversineMetres(a, b)).toBeLessThan(1005);
  });
});

describe('nearestYardId', () => {
  const yards = [
    { id: 'far', latitude: -37.9, longitude: 145.2 },
    { id: 'near', latitude: -37.681, longitude: 145.011 },
    { id: 'no-coords', latitude: null, longitude: null },
  ];

  it('returns the closest yard that has coordinates', () => {
    expect(nearestYardId(yards, { latitude: -37.68, longitude: 145.01 })).toBe('near');
  });

  it('ignores yards without coordinates', () => {
    expect(
      nearestYardId([{ id: 'x', latitude: null, longitude: null }], { latitude: 0, longitude: 0 }),
    ).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(nearestYardId([], { latitude: 0, longitude: 0 })).toBeNull();
  });
});

describe('YARD_DROP_STATUSES', () => {
  it('is exactly in_yard and collected', () => {
    expect(YARD_DROP_STATUSES).toEqual(['in_yard', 'collected']);
  });
});
