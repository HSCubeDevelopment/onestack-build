/** Yards & vehicle logistics (YRD-1) — web types + client-side helpers. Mirrors the API's *View shapes. */

export interface Yard {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
}

export interface YardDrop {
  id: string;
  yardId: string;
  yardName: string;
  rego: string;
  comments: string | null;
  status: 'in_yard' | 'collected';
  droppedAt: string;
  collectedAt: string | null;
}

export interface YardDashboardStats {
  yards: number;
  inYards: number;
}

interface LatLng {
  latitude: number;
  longitude: number;
}

/** Great-circle metres (haversine). Used ONLY to pre-select the nearest yard from a transient fix. */
export function haversineMetres(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The nearest yard id to a position, among yards that have coordinates; null if none do. */
export function nearestYardId(yards: Yard[], pos: LatLng): string | null {
  let best: { id: string; d: number } | null = null;
  for (const y of yards) {
    if (y.latitude == null || y.longitude == null) continue;
    const d = haversineMetres(pos, { latitude: y.latitude, longitude: y.longitude });
    if (!best || d < best.d) best = { id: y.id, d };
  }
  return best?.id ?? null;
}

/** A tag's last known position, as returned by GET /tracking/fleet. */
export interface TagLocation {
  rego: string;
  name: string;
  lat: number | null;
  lng: number | null;
  time: string | null;
  battery: number | null;
  address: string;
}

export interface YardSighting {
  tag: TagLocation;
  metresAway: number;
  /** Hours since the tag last reported, or null when it never has. */
  ageHours: number | null;
  /**
   * Another yard is within AMBIGUOUS_METRES of being just as close, so which of the two the car is
   * actually in cannot be told from the fix. 4 and 6 Milne are 18 m apart, 55 and 57 Temple 19 m —
   * both well inside the error of a crowd-sourced tag.
   */
  ambiguousWith: string | null;
}

/** A car this far from the yard centre is treated as being at it. */
export const YARD_RADIUS_METRES = 150;
/** Two yards whose distances differ by less than this cannot be told apart by a tag fix. */
const AMBIGUOUS_METRES = 60;

/**
 * Assign every tag to the ONE yard it is nearest to, and group the result.
 *
 * Assigning per-yard independently double-counts: 19 and 34 Lipton are 81 m apart, so with a 150 m
 * radius a car sitting at either falls inside both and appears twice. Each car is somewhere singular,
 * so it gets one home — its nearest yard — and the ambiguity is carried on the sighting instead.
 *
 * Returns yards that actually have cars, busiest first.
 */
export function groupTagsByNearestYard(
  yards: Yard[],
  tags: TagLocation[],
  nowMs: number = Date.now(),
): { yard: Yard; sightings: YardSighting[] }[] {
  const positioned = yards.filter((y) => y.latitude != null && y.longitude != null);
  const byYard = new Map<string, YardSighting[]>();

  for (const tag of tags) {
    if (tag.lat == null || tag.lng == null) continue;
    const pos = { latitude: tag.lat, longitude: tag.lng };

    const ranked = positioned
      .map((y) => ({
        y,
        d: haversineMetres(pos, { latitude: y.latitude!, longitude: y.longitude! }),
      }))
      .sort((a, b) => a.d - b.d);

    const best = ranked[0];
    if (!best || best.d > YARD_RADIUS_METRES) continue;
    const runnerUp = ranked[1];

    const sighting: YardSighting = {
      tag,
      metresAway: best.d,
      ageHours: tagAgeHours(tag, nowMs),
      ambiguousWith: runnerUp && runnerUp.d - best.d < AMBIGUOUS_METRES ? runnerUp.y.name : null,
    };
    const list = byYard.get(best.y.id);
    if (list) list.push(sighting);
    else byYard.set(best.y.id, [sighting]);
  }

  return positioned
    .filter((y) => byYard.has(y.id))
    .map((y) => ({
      yard: y,
      sightings: byYard.get(y.id)!.sort((a, b) => a.metresAway - b.metresAway),
    }))
    .sort((a, b) => b.sightings.length - a.sightings.length);
}

/**
 * Hours since a tag last reported, or null if it never has.
 *
 * CityTag sends UTC with no zone marker. Read as local time it would under-report the age by the whole
 * timezone offset, making a stale fix look fresh — so the marker is added explicitly.
 */
function tagAgeHours(tag: TagLocation, nowMs: number): number | null {
  if (!tag.time) return null;
  const hasZone = /[Zz]|[+-]\d\d:?\d\d$/.test(tag.time);
  const t = Date.parse(tag.time.replace(' ', 'T') + (hasZone ? '' : 'Z'));
  return Number.isFinite(t) ? (nowMs - t) / 3_600_000 : null;
}

/** "2h ago", "3d ago", "just now" — how long a car has been sitting in a yard. */
export function timeSince(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
