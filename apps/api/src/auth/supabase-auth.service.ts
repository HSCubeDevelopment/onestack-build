import { Injectable, ServiceUnavailableException } from '@nestjs/common';

/**
 * Thin wrapper over Supabase Auth (GoTrue) for the server-side login proxy. We do NOT hand-roll password
 * hashing/verification — that is delegated to Supabase. This service only:
 *   - verifies an email + password (password grant), and
 *   - resolves emails for a set of user ids (admin API), for the OWNER hours directory.
 *
 * All calls use SUPABASE_SERVICE_ROLE_KEY server-side; no Supabase key is ever exposed to a client.
 * (The client -> API -> Supabase shape matches the rest of the app; clients never talk to Supabase directly.)
 */
@Injectable()
export class SupabaseAuthService {
  private cfg(): { url: string; key: string; anonKey: string } {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new ServiceUnavailableException('Supabase Auth is not configured');
    }
    // The password grant uses the anon key when available (its intended key); admin calls use the
    // service-role key. Fall back to the service key for the grant if no anon key is configured.
    return { url: url.replace(/\/$/, ''), key, anonKey: process.env.SUPABASE_ANON_KEY || key };
  }

  /** Verify credentials against Supabase Auth. Returns the auth user id, or null if they don't match. */
  async verifyPassword(email: string, password: string): Promise<{ userId: string } | null> {
    const { url, anonKey } = this.cfg();
    const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (res.status === 400 || res.status === 401) return null; // invalid credentials
    if (!res.ok) throw new ServiceUnavailableException('Supabase Auth sign-in failed');
    const body = (await res.json()) as { user?: { id?: string } };
    const userId = body.user?.id;
    return userId ? { userId } : null;
  }

  /** Map user ids -> email via the admin API. Missing ids are simply absent from the map. */
  async emailsByUserId(userIds: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (userIds.length === 0) return out;
    const { url, key } = this.cfg();
    const res = await fetch(`${url}/auth/v1/admin/users?per_page=200`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return out; // best-effort: the directory degrades to ids if this fails
    const body = (await res.json()) as { users?: { id: string; email?: string }[] };
    const wanted = new Set(userIds);
    for (const u of body.users ?? []) {
      if (wanted.has(u.id) && u.email) out.set(u.id, u.email);
    }
    return out;
  }

  /** Email + display name for a set of user ids (name from user_metadata). For the PIN name-picker. */
  async profilesByUserId(
    userIds: string[],
  ): Promise<Map<string, { email: string | null; name: string | null }>> {
    const out = new Map<string, { email: string | null; name: string | null }>();
    if (userIds.length === 0) return out;
    const { url, key } = this.cfg();
    const res = await fetch(`${url}/auth/v1/admin/users?per_page=200`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return out;
    const body = (await res.json()) as {
      users?: { id: string; email?: string; user_metadata?: { name?: string } }[];
    };
    const wanted = new Set(userIds);
    for (const u of body.users ?? []) {
      if (wanted.has(u.id)) {
        out.set(u.id, { email: u.email ?? null, name: u.user_metadata?.name ?? null });
      }
    }
    return out;
  }

  /** A single admin user with its server-only app_metadata (where the PIN hash + lockout live). */
  async getUser(userId: string): Promise<AdminUser | null> {
    const { url, key } = this.cfg();
    const res = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new ServiceUnavailableException('Supabase admin read failed');
    return (await res.json()) as AdminUser;
  }

  /**
   * Replace the user's `app_metadata` (server-only). We always send the FULL object we intend to persist
   * (read-merge-write in the caller), so this doesn't depend on GoTrue's merge semantics.
   */
  async putAppMetadata(userId: string, appMetadata: Record<string, unknown>): Promise<void> {
    const { url, key } = this.cfg();
    const res = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_metadata: appMetadata }),
    });
    if (!res.ok) throw new ServiceUnavailableException('Supabase admin update failed');
  }
}

/** Shape of an admin user we care about. app_metadata is server-only and never returned to a client. */
export interface AdminUser {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}
