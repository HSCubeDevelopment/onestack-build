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

/** "2h ago", "3d ago", "just now" — how long a car has been sitting in a yard. */
export function timeSince(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
