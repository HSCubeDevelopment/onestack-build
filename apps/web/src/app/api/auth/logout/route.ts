import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Clear the session cookie — the app falls back to the dev OWNER default afterwards. */
export function POST(): NextResponse {
  const out = NextResponse.json({ ok: true });
  out.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return out;
}
