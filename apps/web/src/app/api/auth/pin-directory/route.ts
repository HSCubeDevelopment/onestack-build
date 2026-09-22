import { NextResponse } from 'next/server';
import { apiBase } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Server-side passthrough of the API's PIN name-picker directory (names + roles only, no PINs).
 *
 * Failures are forwarded, not flattened. This used to return `[]` with a 200 for BOTH a non-ok upstream
 * and a thrown fetch, which made "the API can't do PIN sign-in" indistinguishable from "no staff have
 * been set up" — so a 503 from an unconfigured API rendered as an empty picker with no explanation, and
 * the sign-in page looked broken rather than unconfigured.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const res = await fetch(`${apiBase()}/auth/pin-directory`, { cache: 'no-store' });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      return NextResponse.json(
        { error: body.message ?? 'PIN sign-in is unavailable' },
        { status: res.status },
      );
    }
    return NextResponse.json(await res.json());
  } catch {
    // The API is unreachable altogether — distinct from it answering with an error.
    return NextResponse.json({ error: 'Cannot reach the OneStack API' }, { status: 503 });
  }
}
