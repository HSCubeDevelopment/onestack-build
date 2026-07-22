import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/session';

/**
 * Keep employees out of the owner surface.
 *
 * This is UX, NOT security: the API denies a STAFF token by default and scopes it to its own jobs, so a
 * worker who types /pos gets nothing back either way. Without this they'd land on a page that renders an
 * error instead of being sent somewhere useful.
 *
 * Allowlist rather than blocklist, mirroring the API's @AllowStaff() routes — a page added later is
 * off-limits to employees until someone decides otherwise, instead of quietly appearing.
 */
// The shop-floor STAFF surface = the In N Out employee app (home at `/`, the `/inout/*` flows, and the
// `/fleet/*` detail pages they link to). The other staff-allowlisted routes stay reachable by URL even
// though the In N Out nav no longer surfaces them. TOW is not STAFF, so this middleware never touches it.
const STAFF_PREFIXES = ['/', '/inout', '/fleet', '/jobs', '/roster', '/time-clock', '/customers'];
const STAFF_HOME = '/';

/** Decode the JWT payload without verifying — the API verifies the signature; we only need the role. */
function roleOf(token: string | undefined): string | undefined {
  if (!token) return undefined;
  try {
    const payload = token.split('.')[1];
    if (!payload) return undefined;
    // atob, not Buffer: middleware runs on the Edge runtime.
    const json = JSON.parse(
      decodeURIComponent(
        atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
          .split('')
          .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
          .join(''),
      ),
    );
    return json.role;
  } catch {
    return undefined;
  }
}

export function middleware(req: NextRequest) {
  const role = roleOf(req.cookies.get(SESSION_COOKIE)?.value);
  if (role !== 'STAFF') return NextResponse.next();

  const { pathname } = req.nextUrl;
  const allowed = STAFF_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (allowed) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = STAFF_HOME;
  return NextResponse.redirect(url);
}

// Skip Next internals, the API proxy (the API does its own role checks) and static assets.
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
