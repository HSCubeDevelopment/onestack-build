/**
 * Pure helpers for the Yards domain (YRD-1). No DB / NestJS deps — unit-tested directly.
 */

export type YardDropStatus = 'in_yard' | 'collected';
export const YARD_DROP_STATUSES: YardDropStatus[] = ['in_yard', 'collected'];

/** "1pi3xz " -> "1PI3XZ". Uppercase, strip everything that isn't A-Z/0-9. Matches the fleet rego rule. */
export const normRego = (s: string | null | undefined): string =>
  (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * Great-circle distance in metres (haversine). Used only to suggest the nearest yard to a driver's
 * transient position — the position itself is never stored. Same maths as the geofence module.
 */
export function haversineMetres(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The nearest yard to a position, among yards that have coordinates. Returns the yard's id, or null if
 * no yard has coordinates. Pure — the caller supplies the position; nothing is stored.
 */
export function nearestYardId<
  T extends { id: string; latitude: number | null; longitude: number | null },
>(yards: T[], pos: LatLng): string | null {
  let best: { id: string; d: number } | null = null;
  for (const y of yards) {
    if (y.latitude == null || y.longitude == null) continue;
    const d = haversineMetres(pos, { latitude: y.latitude, longitude: y.longitude });
    if (!best || d < best.d) best = { id: y.id, d };
  }
  return best?.id ?? null;
}

/** Two yards whose distances from a fix differ by less than this cannot be told apart by that fix. */
export const AMBIGUOUS_METRES = 60;
/** A car within this distance of a yard's centre is treated as being at it. */
export const YARD_RADIUS_METRES = 150;

export interface YardMatch {
  /** The yard the fix is closest to. */
  yardId: string;
  metresAway: number;
  /**
   * Id of another yard that is nearly as close, or null. Several of this shop's yards sit closer
   * together than a tag's own error — 4 and 6 Milne are 18 m apart, 55 and 57 Temple 19 m — so for
   * those a fix genuinely cannot say which one a car is in. Callers must surface that rather than
   * presenting the nearer one as fact.
   */
  ambiguousWithYardId: string | null;
}

/**
 * Which yard a position is at, if any. Returns null when the fix is outside every yard.
 *
 * Deliberately refuses to break a near-tie: being 3 m closer to one of two neighbouring yards is noise,
 * not evidence. Staff act on these, so an honest "could be either" beats a confident wrong answer.
 */
export function matchYard<
  T extends { id: string; latitude: number | null; longitude: number | null },
>(position: LatLng, yards: T[], radiusMetres: number = YARD_RADIUS_METRES): YardMatch | null {
  const ranked = yards
    .filter((y) => y.latitude != null && y.longitude != null)
    .map((y) => ({
      id: y.id,
      d: haversineMetres(position, { latitude: y.latitude!, longitude: y.longitude! }),
    }))
    .sort((a, b) => a.d - b.d);

  const best = ranked[0];
  if (!best || best.d > radiusMetres) return null;
  const runnerUp = ranked[1];
  return {
    yardId: best.id,
    metresAway: best.d,
    ambiguousWithYardId: runnerUp && runnerUp.d - best.d < AMBIGUOUS_METRES ? runnerUp.id : null,
  };
}
