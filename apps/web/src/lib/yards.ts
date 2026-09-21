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
 * Which tags are sitting at `yard` right now.
 *
 * Deliberately does NOT pick a winner between neighbouring yards: where a second yard is nearly as
 * close, the sighting is flagged so the screen can say so rather than asserting the wrong one. Staff
 * act on these, and a confident wrong answer is worse than an honest uncertain one.
 */
export function sightingsAtYard(
  yard: Yard,
  yards: Yard[],
  tags: TagLocation[],
  nowMs: number = Date.now(),
): YardSighting[] {
  if (yard.latitude == null || yard.longitude == null) return [];
  const here = { latitude: yard.latitude, longitude: yard.longitude };
  const others = yards.filter((y) => y.id !== yard.id && y.latitude != null && y.longitude != null);

  const out: YardSighting[] = [];
  for (const tag of tags) {
    if (tag.lat == null || tag.lng == null) continue;
    const pos = { latitude: tag.lat, longitude: tag.lng };
    const metresAway = haversineMetres(pos, here);
    if (metresAway > YARD_RADIUS_METRES) continue;

    let ambiguousWith: string | null = null;
    for (const o of others) {
      const d = haversineMetres(pos, { latitude: o.latitude!, longitude: o.longitude! });
      if (d - metresAway < AMBIGUOUS_METRES) {
        ambiguousWith = o.name;
        break;
      }
    }

    // CityTag reports UTC with no zone marker, so say so explicitly rather than letting the browser
    // read it as local time and under-report the age by the timezone offset.
    let ageHours: number | null = null;
    if (tag.time) {
      const t = Date.parse(
        tag.time.replace(' ', 'T') + (/[Zz]|[+-]\d\d:?\d\d$/.test(tag.time) ? '' : 'Z'),
      );
      if (Number.isFinite(t)) ageHours = (nowMs - t) / 3_600_000;
    }

    out.push({ tag, metresAway, ageHours, ambiguousWith });
  }
  return out.sort((a, b) => a.metresAway - b.metresAway);
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
