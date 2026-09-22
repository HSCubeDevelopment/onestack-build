import { NextRequest, NextResponse } from 'next/server';
import { decodeToken, devIdentityAllowed, SESSION_COOKIE } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * The current identity for the client (role-aware UI). If signed in, reflect the real session token's
 * claims.
 *
 * With no session it used to answer "you are the OWNER, signedIn: false" — the skeleton default. That
 * grants nothing on its own (the proxy refuses an anonymous call), but it tells the browser to draw
 * owner UI for a stranger, so it is gated with the other two dev-identity fallbacks. Off a dev
 * machine, an anonymous caller is simply nobody.
 */
export function GET(req: NextRequest) {
  const session = req.cookies.get(SESSION_COOKIE)?.value;
  if (session) {
    const claims = decodeToken(session);
    if (claims?.userId) {
      return NextResponse.json({
        userId: claims.userId,
        tenantId: claims.tenantId,
        role: claims.role ?? 'STAFF',
        signedIn: true,
      });
    }
  }
  if (devIdentityAllowed()) {
    return NextResponse.json({
      userId: process.env.DEMO_OWNER_USER_ID,
      tenantId: process.env.DEMO_TENANT_ID,
      role: 'OWNER',
      signedIn: false,
    });
  }
  return NextResponse.json({ userId: null, tenantId: null, role: null, signedIn: false });
}
