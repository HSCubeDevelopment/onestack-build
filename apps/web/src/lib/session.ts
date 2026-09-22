import 'server-only';
import jwt from 'jsonwebtoken';

/**
 * Whether this build may stand in an OWNER identity for a caller who has not signed in.
 *
 * ⚠️ This is the difference between a convenient laptop and an open front door. Everything below it —
 * the API proxy's token, the layout's role — falls back to the demo OWNER when nobody is signed in,
 * which on a public URL means every visitor arrives as the owner, holding a valid API token for the
 * shop's customers, jobs and money.
 *
 * So it is gated the same way the API gates its dev login, and the default of each condition is the
 * safe answer. Vercel and every other real host set NODE_ENV=production, so a deploy closes this on
 * its own even if the variable is copied across by mistake.
 */
export function devIdentityAllowed(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return process.env.DEV_LOGIN_ENABLED === 'true';
}

/**
 * Dev session for the walking skeleton: a short-lived JWT for the seeded demo tenant/owner, in exactly
 * the shape the API's JwtAuthGuard expects ({ sub, tenant_id, role }). The secret and token never reach
 * the browser — the proxy attaches it server-side (see app/api/backend/[...path]/route.ts).
 *
 * Returns null rather than throwing when it is not allowed or not configured: the callers turn that
 * into "sign in", which is the correct answer for an anonymous request. It used to throw only on
 * missing env, so a deployment that HAD the env minted owner tokens for the public.
 */
export function mintDevToken(): string | null {
  if (!devIdentityAllowed()) return null;
  const secret = process.env.SUPABASE_JWT_SECRET;
  const tenantId = process.env.DEMO_TENANT_ID;
  const userId = process.env.DEMO_OWNER_USER_ID;
  if (!secret || !tenantId || !userId) return null;
  return jwt.sign({ sub: userId, tenant_id: tenantId, role: 'OWNER' }, secret, {
    expiresIn: '15m',
  });
}

export const apiBase = (): string =>
  process.env.ONESTACK_API_BASE ?? 'http://localhost:3001/api/v1';

/** httpOnly cookie holding the real Supabase-Auth-backed session token (set by /api/auth/login). */
export const SESSION_COOKIE = 'onestack_session';

/** Read the (unverified) claims out of a JWT for display/routing. The API still verifies the signature. */
export function decodeToken(
  token: string,
): { userId?: string; tenantId?: string; role?: string } | null {
  try {
    const payload = token.split('.')[1];
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return { userId: json.sub, tenantId: json.tenant_id, role: json.role };
  } catch {
    return null;
  }
}
