import { NextRequest, NextResponse } from 'next/server';
import { apiBase, SESSION_COOKIE } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Sign in as a named person without their PIN, and store the returned session in the httpOnly cookie —
 * the same cookie, shape and lifetime as PIN sign-in, so everything downstream is identical.
 *
 * This route decides nothing. The API's /auth/open-login re-checks the gate (not production, dev login
 * on, PIN checks explicitly off) and answers 403 otherwise, which is simply forwarded. A build where
 * that gate is shut cannot be talked into a session from here.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.text();
  const res = await fetch(`${apiBase()}/auth/open-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => ({}))) as {
    token?: string;
    user?: { role?: string };
    expiresInSeconds?: number;
    message?: string | string[];
  };
  if (!res.ok || !data.token) {
    const msg = Array.isArray(data.message) ? data.message.join(', ') : data.message;
    return NextResponse.json(
      { error: msg || 'Could not switch profile' },
      { status: res.status || 403 },
    );
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
