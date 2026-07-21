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
