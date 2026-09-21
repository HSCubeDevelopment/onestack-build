import { NextResponse } from 'next/server';
import { apiBase } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Whether the sign-in screen should ask for a PIN.
 *
 * Fails CLOSED: if the API cannot be reached or answers with anything unexpected, the browser is told
 * a PIN is required. The worst case is then a keypad someone cannot get past, never a screen that
 * waves people through because a fetch failed.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const res = await fetch(`${apiBase()}/auth/mode`, { cache: 'no-store' });
    if (!res.ok) return NextResponse.json({ pinsRequired: true });
    const body = (await res.json()) as { pinsRequired?: unknown };
    return NextResponse.json({ pinsRequired: body.pinsRequired !== false });
  } catch {
    return NextResponse.json({ pinsRequired: true });
  }
}
