import { NextResponse } from 'next/server';
import { apiBase } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Server-side passthrough of the API's PIN name-picker directory (names + roles only, no PINs). */
export async function GET(): Promise<NextResponse> {
  try {
    const res = await fetch(`${apiBase()}/auth/pin-directory`, { cache: 'no-store' });
    if (!res.ok) return NextResponse.json([]);
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json([]);
  }
}
