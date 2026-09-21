import { describe, expect, it } from 'vitest';
import {
  haversineMetres,
  matchYard,
  nearestYardId,
  normRego,
  YARD_DROP_STATUSES,
} from './yards.util';

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

// Real coordinates from the shop's yards, and the real problem they create: 55 and 57 Temple Drive are
// 19 m apart, which is inside the error of a crowd-sourced Bluetooth tag.
const TEMPLE_55 = { id: '55', latitude: -37.689735, longitude: 145.014509 };
const TEMPLE_57 = { id: '57', latitude: -37.689565, longitude: 145.014547 };
const LIPTON_19 = { id: 'lip', latitude: -37.689493, longitude: 144.997609 };

describe('matchYard', () => {
  it('matches a car sitting on the yard', () => {
    const m = matchYard({ latitude: -37.689493, longitude: 144.997609 }, [LIPTON_19]);
    expect(m?.yardId).toBe('lip');
    expect(m!.metresAway).toBeLessThan(5);
  });

  it('returns null for a car out with a customer', () => {
    // Melbourne CBD — ~15 km away.
    expect(matchYard({ latitude: -37.8136, longitude: 144.9631 }, [LIPTON_19])).toBeNull();
  });

  it('refuses to break a near-tie between neighbouring yards', () => {
    const m = matchYard({ latitude: -37.68965, longitude: 145.01453 }, [TEMPLE_55, TEMPLE_57]);
    expect(m).not.toBeNull();
    expect(m!.ambiguousWithYardId).not.toBeNull();
    expect([TEMPLE_55.id, TEMPLE_57.id]).toContain(m!.ambiguousWithYardId);
  });

  it('is unambiguous when the next yard is far away', () => {
    const m = matchYard({ latitude: -37.689493, longitude: 144.997609 }, [LIPTON_19, TEMPLE_57]);
    expect(m?.yardId).toBe('lip');
    expect(m?.ambiguousWithYardId).toBeNull();
  });

  it('ignores yards that have no coordinates', () => {
    const noCoords = { id: 'x', latitude: null, longitude: null };
    expect(matchYard({ latitude: -37.689493, longitude: 144.997609 }, [noCoords])).toBeNull();
  });

  it('honours a custom radius', () => {
    const pos = { latitude: -37.690393, longitude: 144.997609 }; // ~100 m north
    expect(matchYard(pos, [LIPTON_19], 150)?.yardId).toBe('lip');
    expect(matchYard(pos, [LIPTON_19], 50)).toBeNull();
  });
});
