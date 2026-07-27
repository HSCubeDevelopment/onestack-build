import { describe, expect, it } from 'vitest';
import { checkGeofenceAny, distanceMetres, WORKSHOP } from './geofence';
import { fencesForKeys, siteFence } from './workshop-sites';

const lipton = siteFence('lipton')!;
const temple = siteFence('temple')!;

/** Metres of longitude → degrees, at the sites' latitude (~-37.69°). */
const METRES_PER_LON_DEG = 111_320 * Math.cos((-37.69 * Math.PI) / 180);
const eastOf = (lon: number, metres: number) => lon + metres / METRES_PER_LON_DEG;

describe('workshop sites registry', () => {
  it('knows the two shops and rejects unknown keys', () => {
    expect(siteFence('lipton')?.label).toMatch(/Lipton/);
    expect(siteFence('temple')?.label).toMatch(/Temple/);
    expect(siteFence('nope')).toBeNull();
  });

  it('maps keys to fences, dropping unknowns and de-duplicating', () => {
    expect(fencesForKeys(['lipton', 'temple']).map((f) => f.label)).toHaveLength(2);
    expect(fencesForKeys(['lipton', 'bogus']).map((f) => f.label)).toHaveLength(1);
    expect(fencesForKeys(['temple', 'temple'])).toHaveLength(1); // de-duped
    expect(fencesForKeys([])).toHaveLength(0);
  });

  it('the two shops are ~1.7 km apart (sanity on the geocodes)', () => {
    const d = distanceMetres(lipton, temple);
    expect(d).toBeGreaterThan(1500);
    expect(d).toBeLessThan(2000);
  });
});

describe('checkGeofenceAny', () => {
  const at = (lat: number, lon: number) => ({ latitude: lat, longitude: lon, accuracyMetres: 10 });

  it('with no fences, falls back to the default workshop fence', () => {
    const r = checkGeofenceAny(at(WORKSHOP.latitude, WORKSHOP.longitude), []);
    expect(r.verdict).toBe('inside');
    expect(r.allowed).toBe(true);
  });

  it('is inside when the worker is at ANY assigned shop', () => {
    // At Temple, both 3 km fences overlap, so this is "on site" — the worker is allowed. (Which shop's
    // label wins when both contain the point doesn't matter; being allowed does.)
    const r = checkGeofenceAny(
      at(temple.latitude, temple.longitude),
      fencesForKeys(['lipton', 'temple']),
    );
    expect(r.allowed).toBe(true);
    expect(r.verdict).toBe('inside');
  });

  it('the union matters: a point only Temple covers is refused when assigned Lipton alone', () => {
    // ~2 km east of Temple: inside Temple's 3 km fence, but > 3 km from Lipton.
    const point = at(temple.latitude, eastOf(temple.longitude, 2000));

    const liptonOnly = checkGeofenceAny(point, fencesForKeys(['lipton']));
    expect(liptonOnly.allowed).toBe(false);
    expect(liptonOnly.verdict).toBe('outside');

    const both = checkGeofenceAny(point, fencesForKeys(['lipton', 'temple']));
    expect(both.allowed).toBe(true); // Temple now covers it
    expect(both.reason).toMatch(/Temple/); // and only Temple contains this point
  });

  it('when outside every shop, reports the nearest one', () => {
    // Far north of both — Lipton is the nearer of the two from here.
    const point = at(lipton.latitude + 0.05, lipton.longitude);
    const r = checkGeofenceAny(point, fencesForKeys(['lipton', 'temple']));
    expect(r.allowed).toBe(false);
    const dLipton = Math.round(distanceMetres(point, lipton));
    expect(r.distanceMetres).toBe(dLipton); // the smaller of the two distances
  });

  it('a no-fix position stays unavailable across multiple fences', () => {
    const r = checkGeofenceAny(null, fencesForKeys(['lipton', 'temple']));
    expect(r.verdict).toBe('unavailable');
    expect(r.allowed).toBe(false);
  });
});
