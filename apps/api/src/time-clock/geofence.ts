/**
 * Card 53.1 — geofenced check-in. Pure; no DB, no Nest, no browser.
 *
 * ⚠️ PRIVACY. This decides whether a worker was near the shop when they clocked on. Two rules follow
 * from that, and both are deliberate:
 *
 *   1. Raw coordinates are NEVER returned or persisted. This module takes a position and gives back a
 *      DISTANCE and a verdict. The shop's legitimate question is "were they on site?", not "where is
 *      this person?" — and a database of employee coordinates is a liability nobody asked for.
 *   2. A worker is never silently locked out. Outside the fence, or with GPS unavailable, check-in is
 *      refused with a reason AND an override path. A dead GPS chip must not cost someone their shift;
 *      the override is recorded so the owner sees it rather than it passing unnoticed.
 */

export interface Coords {
  latitude: number;
  longitude: number;
  /** The device's own error estimate, in metres. Large values mean a wifi/cell fix, not true GPS. */
  accuracyMetres?: number;
}

export interface Geofence {
  label: string;
  latitude: number;
  longitude: number;
  radiusMetres: number;
}

/**
 * The workshop. Coordinates for 15 Lipton Drive, Thomastown VIC 3074.
 *
 * NOTE FOR REVIEW: these are approximate, taken from the street address rather than a surveyed point.
 * Stand in the workshop doorway, read the phone's coordinates, and correct them before go-live — a
 * geofence centred 50 m off means the far end of the yard falls outside it.
 *
 * The 150 m radius is chosen to cover an industrial lot plus its street parking. Tighten it once the
 * centre is accurate; a radius smaller than the site is how you get false refusals every morning.
 */
export const WORKSHOP: Geofence = {
  label: '15 Lipton Drive, Thomastown VIC',
  latitude: -37.6829,
  longitude: 145.0169,
  radiusMetres: 150,
};

/**
 * A GPS fix worse than this tells us almost nothing — a 500 m accuracy circle covers the whole
 * industrial estate, so "inside the fence" would be a coin flip dressed up as a measurement.
 */
export const MAX_USABLE_ACCURACY_METRES = 200;

export type GeofenceVerdict =
  | 'inside'
  | 'outside'
  /** A fix arrived but is too imprecise to judge. Treated as a refusal, not a pass. */
  | 'inaccurate'
  /** No fix at all: permission denied, hardware off, or the browser timed out. */
  | 'unavailable';

export interface GeofenceResult {
  verdict: GeofenceVerdict;
  /** Metres from the fence centre, rounded. Null when there was no usable fix. */
  distanceMetres: number | null;
  /** True only for `inside`. The one field a caller needs to allow a clean check-in. */
  allowed: boolean;
  /** Plain English, shown to the worker. Never blames them for a hardware failure. */
  reason: string;
}

const EARTH_RADIUS_METRES = 6_371_008.8;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Great-circle distance (haversine), in metres.
 *
 * Haversine rather than a flat-earth approximation because the latter is wrong by a factor that grows
 * with latitude — at Melbourne's -37.7°, treating a degree of longitude as a degree of latitude
 * overstates east-west distance by about 26%, which is the difference between inside and outside a
 * 150 m fence.
 */
export function distanceMetres(a: Coords, b: Coords): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** True for a syntactically valid earth coordinate. Guards against 0,0 and swapped lat/long. */
export function isValidCoords(c: Coords | null | undefined): c is Coords {
  if (!c) return false;
  const { latitude: lat, longitude: lon } = c;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
  // Null Island. A real fix is never exactly 0,0; this is what a zeroed struct looks like.
  return !(lat === 0 && lon === 0);
}

/**
 * Judge a position against a fence.
 *
 * The accuracy check runs BEFORE the distance check on purpose: a 20 m reading from a fix with 400 m
 * of error is not evidence of being on site, and reporting it as `inside` would make the geofence
 * theatre. Better to say "we couldn't tell" and let the worker override.
 */
export function checkGeofence(
  position: Coords | null | undefined,
  fence: Geofence = WORKSHOP,
): GeofenceResult {
  if (!isValidCoords(position)) {
    return {
      verdict: 'unavailable',
      distanceMetres: null,
      allowed: false,
      // Phrased as the app's problem, because from the worker's side it is.
      reason: 'Location unavailable — allow location access, or check in with a reason.',
    };
  }

  const accuracy = position.accuracyMetres;
  if (
    accuracy !== undefined &&
    Number.isFinite(accuracy) &&
    accuracy > MAX_USABLE_ACCURACY_METRES
  ) {
    return {
      verdict: 'inaccurate',
      distanceMetres: Math.round(distanceMetres(position, fence)),
      allowed: false,
      reason: `Location is only accurate to ${Math.round(accuracy)} m — too rough to confirm you're on site.`,
    };
  }

  const metres = Math.round(distanceMetres(position, fence));
  if (metres <= fence.radiusMetres) {
    return {
      verdict: 'inside',
      distanceMetres: metres,
      allowed: true,
      reason: `On site at ${fence.label}.`,
    };
  }

  return {
    verdict: 'outside',
    distanceMetres: metres,
    allowed: false,
    reason: `You're about ${formatDistance(metres)} from ${fence.label}.`,
  };
}

/** Human distance: metres up close, kilometres once that stops being meaningful. */
export function formatDistance(metres: number): string {
  if (metres < 1000) return `${metres} m`;
  return `${(metres / 1000).toFixed(metres < 10_000 ? 1 : 0)} km`;
}
