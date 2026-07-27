/**
 * Named workshop locations, and the map from an employee's assigned-site KEYS to geofences. Pure.
 *
 * These keys are the shared vocabulary with the employee-admin panel: it writes an array of them to a
 * user's Supabase `app_metadata.assigned_sites`, and the check-in resolver (see assigned-sites.resolver)
 * reads them back and maps them here. Keep the keys identical on both sides. Coordinates are geocoded
 * from the street address (not surveyed), like the default workshop — a starting point, not a survey.
 *
 * Each site fence uses the SAME radius as the active default workshop fence (WORKSHOP.radiusMetres), so
 * the owner's WORKSHOP_RADIUS_METRES setting applies uniformly and there's one knob, not one per shop.
 */
import { Geofence, WORKSHOP } from './geofence';

/** The app_metadata key the admin panel writes and we read. Must match the panel. */
export const ASSIGNED_SITES_META_KEY = 'assigned_sites';

interface SiteDef {
  key: string;
  label: string;
  latitude: number;
  longitude: number;
}

const SITE_DEFS: SiteDef[] = [
  {
    key: 'lipton',
    label: '19 Lipton Drive, Thomastown VIC',
    latitude: -37.6894934,
    longitude: 144.9976091,
  },
  {
    key: 'temple',
    label: '57 Temple Drive, Thomastown VIC',
    latitude: -37.6905035,
    longitude: 145.0170989,
  },
];

const DEF_BY_KEY = new Map(SITE_DEFS.map((d) => [d.key, d]));

/** The geofence for one site key, or null if the key isn't a known site. */
export function siteFence(key: string): Geofence | null {
  const d = DEF_BY_KEY.get(key);
  if (!d) return null;
  return {
    label: d.label,
    latitude: d.latitude,
    longitude: d.longitude,
    radiusMetres: WORKSHOP.radiusMetres,
  };
}

/** Map assigned-site keys to their fences, dropping any unknown keys, preserving order. */
export function fencesForKeys(keys: string[]): Geofence[] {
  const seen = new Set<string>();
  const out: Geofence[] = [];
  for (const key of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const f = siteFence(key);
    if (f) out.push(f);
  }
  return out;
}
