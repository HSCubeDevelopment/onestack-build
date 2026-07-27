/**
 * Generate a random 4-digit PIN for every member of the demo tenant (owner, tow, each employee), store
 * only the salted hash in Supabase app_metadata, and print the plaintext list ONCE so the owner can save
 * it. Re-running regenerates every PIN. This is the "enable it on the backend" step for PIN sign-in.
 *
 * Run: npm run pins:set   (needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_TENANT_ID, DATABASE_URL)
 *
 * ⚠️ The plaintext PINs are printed to stdout — run it somewhere private and don't commit the output.
 */
import 'dotenv/config';
import { randomInt } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { EMPLOYEE_ROSTER } from '../src/auth/employee-roster';
import { hashPin } from '../src/auth/pin';

const URL = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const TENANT_ID = process.env.DEMO_TENANT_ID ?? '';

if (!URL || !KEY || !TENANT_ID || !process.env.DATABASE_URL) {
  console.error(
    'Missing env: need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_TENANT_ID, DATABASE_URL',
  );
  process.exit(1);
}

const admin = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const prisma = new PrismaClient();
const siteByEmail = new Map(EMPLOYEE_ROSTER.map((e) => [e.email.toLowerCase(), e.site]));

interface AdminUser {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: { name?: string };
}

async function getUser(id: string): Promise<AdminUser | null> {
  const res = await fetch(`${URL}/auth/v1/admin/users/${id}`, { headers: admin });
  if (!res.ok) return null;
  return (await res.json()) as AdminUser;
}

async function setPinHash(
  id: string,
  currentMeta: Record<string, unknown>,
  hash: string,
): Promise<void> {
  const app_metadata = {
    ...currentMeta,
    pin_hash: hash,
    pin_failed_count: 0,
    pin_locked_until: null,
  };
  const res = await fetch(`${URL}/auth/v1/admin/users/${id}`, {
    method: 'PUT',
    headers: admin,
    body: JSON.stringify({ app_metadata }),
  });
  if (!res.ok) throw new Error(`Failed to set PIN for ${id}: ${res.status} ${await res.text()}`);
}

/** A fresh 4-digit PIN not already handed out this run. */
function uniquePin(taken: Set<string>): string {
  for (let i = 0; i < 100000; i++) {
    const pin = String(randomInt(0, 10000)).padStart(4, '0');
    if (!taken.has(pin)) {
      taken.add(pin);
      return pin;
    }
  }
  throw new Error('Exhausted the 4-digit PIN space');
}

async function main(): Promise<void> {
  const members = await prisma.membership.findMany({
    where: { tenantId: TENANT_ID },
    select: { userId: true, role: true },
  });
  if (members.length === 0) {
    console.error(`No members found for tenant ${TENANT_ID}.`);
    process.exit(1);
  }

  const taken = new Set<string>();
  const rows: { name: string; role: string; email: string; pin: string }[] = [];

  for (const m of members) {
    const user = await getUser(m.userId);
    if (!user) {
      console.warn(`! No Supabase user for ${m.userId} — skipped`);
      continue;
    }
    const pin = uniquePin(taken);
    await setPinHash(m.userId, user.app_metadata ?? {}, hashPin(pin));
    const email = user.email ?? '';
    rows.push({
      name: user.user_metadata?.name || email || m.userId,
      role: m.role,
      email,
      pin,
    });
  }

  // Owner first, then tow, then employees A–Z.
  const rank = (r: string) => (r === 'OWNER' ? 0 : r === 'TOW' ? 1 : 2);
  rows.sort((a, b) => rank(a.role) - rank(b.role) || a.name.localeCompare(b.name));

  console.log(
    `\nSet ${rows.length} PINs for tenant ${TENANT_ID}. SAVE THIS LIST — it is not shown again.\n`,
  );
  console.log('PIN   ROLE      NAME                 SITE');
  console.log('----  --------  -------------------  ----------------------------');
  for (const r of rows) {
    const site = siteByEmail.get(r.email.toLowerCase()) ?? '';
    console.log(
      `${r.pin}  ${r.role.padEnd(8)}  ${r.name.slice(0, 19).padEnd(19)}  ${site.split(',')[0]}`,
    );
  }
  console.log('');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
