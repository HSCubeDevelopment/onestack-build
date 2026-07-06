import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Exposes the demo identity to the client (dev only) — used for "assign me" on jobs. */
export function GET() {
  return NextResponse.json({
    userId: process.env.DEMO_OWNER_USER_ID,
    tenantId: process.env.DEMO_TENANT_ID,
    role: 'OWNER',
  });
}
