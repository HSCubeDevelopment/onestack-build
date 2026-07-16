import 'server-only';
import jwt from 'jsonwebtoken';

/**
 * Dev session for the walking skeleton. Real login is Supabase Auth (managed) — not wired into this
 * skeleton yet. Here the SERVER mints a short-lived JWT for the seeded demo tenant/owner, exactly the
 * shape the API's JwtAuthGuard expects ({ sub, tenant_id, role }). The secret and token never reach the
 * browser: the proxy attaches the token server-side (see app/api/backend/[...path]/route.ts).
 */
export function mintDevToken(): string {
  const secret = process.env.SUPABASE_JWT_SECRET;
  const tenantId = process.env.DEMO_TENANT_ID;
  const userId = process.env.DEMO_OWNER_USER_ID;
  if (!secret || !tenantId || !userId) {
    throw new Error('Missing SUPABASE_JWT_SECRET / DEMO_TENANT_ID / DEMO_OWNER_USER_ID in env');
  }
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
