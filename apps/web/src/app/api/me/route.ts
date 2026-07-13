import { NextRequest, NextResponse } from 'next/server';
import { decodeToken, SESSION_COOKIE } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * The current identity for the client (role-aware UI). If signed in, reflect the real session token's
 * claims; otherwise fall back to the seeded demo OWNER (skeleton default).
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
  return NextResponse.json({
    userId: process.env.DEMO_OWNER_USER_ID,
    tenantId: process.env.DEMO_TENANT_ID,
    role: 'OWNER',
    signedIn: false,
  });
}
