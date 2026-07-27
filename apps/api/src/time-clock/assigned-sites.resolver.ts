import { Injectable } from '@nestjs/common';
import { ASSIGNED_SITES_META_KEY } from './workshop-sites';

/**
 * Resolves an employee's assigned workshop-site keys for the check-in geofence. The assignment is set by
 * the employee-admin panel and stored in the user's server-only Supabase `app_metadata.assigned_sites`.
 *
 * Self-contained on purpose: it reads the Supabase admin API directly (env-configured) rather than
 * importing the auth module, keeping the time-clock module isolated. It FAILS SAFE — a missing config,
 * a network error, or a user with no explicit assignment all resolve to `[]`, which the caller treats as
 * "use the default workshop fence". A geofence lookup must never be the thing that blocks a clock-in.
 */
@Injectable()
export class AssignedSitesResolver {
  async keysForUser(userId: string): Promise<string[]> {
    const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return []; // not configured → default fence
    try {
      const res = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      if (!res.ok) return [];
      const body = (await res.json()) as { app_metadata?: Record<string, unknown> };
      const raw = body.app_metadata?.[ASSIGNED_SITES_META_KEY];
      return Array.isArray(raw) ? raw.filter((k): k is string => typeof k === 'string') : [];
    } catch {
      return []; // never let a Supabase hiccup block a clock-in
    }
  }
}
