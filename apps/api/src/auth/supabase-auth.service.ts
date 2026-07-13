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
}
