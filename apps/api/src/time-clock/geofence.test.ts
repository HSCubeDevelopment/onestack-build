import { describe, expect, it } from 'vitest';
import { checkGeofence, distanceMetres, formatDistance, isValidCoords, WORKSHOP } from './geofence';

/** A position offset from the workshop by roughly `m` metres, due north. */
const northOf = (m: number) => ({
  latitude: WORKSHOP.latitude + m / 111_320,
  longitude: WORKSHOP.longitude,
});

describe('distanceMetres', () => {
  it('is zero at the same point', () => {
    expect(distanceMetres(WORKSHOP, WORKSHOP)).toBe(0);
  });

  it('measures a known north-south offset', () => {
    // 1000 m north should read ~1000 m, within a metre or two.
    expect(distanceMetres(WORKSHOP, northOf(1000))).toBeGreaterThan(995);
    expect(distanceMetres(WORKSHOP, northOf(1000))).toBeLessThan(1005);
  });

  it('does not treat a degree of longitude as a degree of latitude', () => {
    // At Melbourne's latitude a degree of longitude is ~79% of a degree of latitude. A flat-earth
    // approximation overstates east-west distance by ~26% — the difference between inside and
    // outside a 150 m fence.
    const east = { latitude: WORKSHOP.latitude, longitude: WORKSHOP.longitude + 0.01 };
    const north = { latitude: WORKSHOP.latitude + 0.01, longitude: WORKSHOP.longitude };
    const eastM = distanceMetres(WORKSHOP, east);
    const northM = distanceMetres(WORKSHOP, north);
    expect(eastM).toBeLessThan(northM * 0.85);
  });

  it('is symmetric', () => {
    const p = northOf(500);
    expect(distanceMetres(WORKSHOP, p)).toBeCloseTo(distanceMetres(p, WORKSHOP), 6);
  });
});

describe('isValidCoords', () => {
  it('accepts the workshop', () => {
    expect(isValidCoords(WORKSHOP)).toBe(true);
  });

  it('rejects nothing, NaN and out-of-range values', () => {
    expect(isValidCoords(null)).toBe(false);
    expect(isValidCoords({ latitude: Number.NaN, longitude: 145 })).toBe(false);
    expect(isValidCoords({ latitude: 91, longitude: 145 })).toBe(false);
    expect(isValidCoords({ latitude: -37, longitude: 181 })).toBe(false);
  });

  it('rejects 0,0 — that is a zeroed struct, not a fix in the Atlantic', () => {
    expect(isValidCoords({ latitude: 0, longitude: 0 })).toBe(false);
  });
});

describe('checkGeofence', () => {
  it('allows a check-in at the workshop', () => {
    const r = checkGeofence(WORKSHOP);
    expect(r.verdict).toBe('inside');
    expect(r.allowed).toBe(true);
    expect(r.distanceMetres).toBe(0);
  });

  it('allows anywhere inside the radius', () => {
    expect(checkGeofence(northOf(100)).allowed).toBe(true);
    expect(checkGeofence(northOf(149)).allowed).toBe(true);
  });

  it('refuses just outside, and says how far', () => {
    const r = checkGeofence(northOf(400));
    expect(r.verdict).toBe('outside');
    expect(r.allowed).toBe(false);
    expect(r.distanceMetres).toBeGreaterThan(390);
    expect(r.reason).toMatch(/Lipton Drive/);
  });

  it('refuses when there is no fix, and blames the app rather than the worker', () => {
    const r = checkGeofence(null);
    expect(r.verdict).toBe('unavailable');
    expect(r.distanceMetres).toBeNull();
    // Tone matters: someone whose phone denied permission has done nothing wrong.
    expect(r.reason).toMatch(/Location unavailable/);
    expect(r.reason).toMatch(/check in with a reason/);
  });

  it('refuses a fix too imprecise to mean anything, even if it reads as nearby', () => {
    // THE IMPORTANT ONE. Standing "10 m away" according to a fix with 400 m of error is not evidence
    // of being on site. Reporting that as inside would make the whole geofence theatre.
    const r = checkGeofence({ ...northOf(10), accuracyMetres: 400 });
    expect(r.verdict).toBe('inaccurate');
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/400 m/);
  });

  it('accepts a good fix with a sane accuracy figure', () => {
    expect(checkGeofence({ ...northOf(20), accuracyMetres: 12 }).allowed).toBe(true);
  });

  it('never returns raw coordinates — only a distance and a verdict', () => {
    const r = checkGeofence({ ...northOf(50), accuracyMetres: 8 });
    const keys = Object.keys(r).sort();
    expect(keys).toEqual(['allowed', 'distanceMetres', 'reason', 'verdict']);
    // Belt and braces: no field anywhere in the result carries a latitude or longitude.
    expect(JSON.stringify(r)).not.toMatch(/latitude|longitude/);
  });

  it('works against a different fence, so a second site needs no code change', () => {
    const other = { label: 'Coburg', latitude: -37.74, longitude: 144.96, radiusMetres: 100 };
    expect(checkGeofence(other, other).allowed).toBe(true);
    expect(checkGeofence(WORKSHOP, other).allowed).toBe(false);
  });
});

describe('formatDistance', () => {
  it('uses metres up close and kilometres further out', () => {
    expect(formatDistance(240)).toBe('240 m');
    expect(formatDistance(1500)).toBe('1.5 km');
    expect(formatDistance(42_000)).toBe('42 km');
  });
});
