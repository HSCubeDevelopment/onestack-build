import { NextResponse } from 'next/server';
import { apiBase } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Server-side passthrough of the API's dev-gated demo credentials, so the sign-in page can show them. */
export async function GET(): Promise<NextResponse> {
  try {
    const res = await fetch(`${apiBase()}/auth/demo-credentials`, { cache: 'no-store' });
    if (!res.ok) return NextResponse.json({ accounts: [] });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ accounts: [] });
  }
}
