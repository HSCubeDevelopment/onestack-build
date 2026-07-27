import { NextRequest, NextResponse } from 'next/server';
import { apiBase, SESSION_COOKIE } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * PIN sign-in: forwards { userId, pin } to the API's /auth/pin-login and, on success, stores the returned
 * session token in an httpOnly cookie. The token never reaches client JS; the PIN is only ever in transit.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.text();
  const res = await fetch(`${apiBase()}/auth/pin-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => ({}))) as {
    token?: string;
    user?: { role?: string };
    expiresInSeconds?: number;
    message?: string;
  };
  if (!res.ok || !data.token) {
    const msg = Array.isArray(data.message) ? data.message.join(', ') : data.message;
    return NextResponse.json({ error: msg || 'Incorrect PIN' }, { status: res.status || 401 });
  }
  const out = NextResponse.json({ role: data.user?.role ?? 'STAFF' });
  out.cookies.set(SESSION_COOKIE, data.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: data.expiresInSeconds ?? 60 * 60 * 8,
  });
  return out;
}
