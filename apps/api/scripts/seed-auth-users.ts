// Seed real Supabase Auth users for the demo tenant so the app has genuine email+password logins
// (an OWNER and a STAFF), and link each to the demo tenant via Membership. Idempotent.
//
// Run: npm run seed:auth   (needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_TENANT_ID in apps/api/.env)
import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';

const URL = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const TENANT_ID = process.env.DEMO_TENANT_ID ?? '0d15ea5e-0000-4000-8000-000000000001';

const ACCOUNTS = [
  {
    role: Role.OWNER,
    email: process.env.DEMO_OWNER_EMAIL ?? 'owner@onestack.test',
    password: process.env.DEMO_OWNER_PASSWORD ?? 'Owner!2345',
  },
  {
    role: Role.STAFF,
    email: process.env.DEMO_STAFF_EMAIL ?? 'staff@onestack.test',
    password: process.env.DEMO_STAFF_PASSWORD ?? 'Staff!2345',
  },
  {
    // Tow driver — a first-class TOW role (301): staff-level API access, but a tow-focused web
    // experience. Runs the tow-in flow (YRD-2).
    role: Role.TOW,
    email: process.env.DEMO_TOW_EMAIL ?? 'tow@onestack.test',
    password: process.env.DEMO_TOW_PASSWORD ?? 'Tow!2345',
  },
];

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

/** Create the auth user (or find the existing one) and return its id. Also (re)sets the password. */
async function ensureAuthUser(email: string, password: string): Promise<string> {
  const create = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (create.ok) {
    const u = (await create.json()) as { id: string };
    return u.id;
  }
  // Already registered — find the id, then reset the password so the printed creds always work.
  const list = await fetch(`${URL}/auth/v1/admin/users?per_page=200`, { headers });
  const body = (await list.json()) as { users?: { id: string; email?: string }[] };
  const existing = (body.users ?? []).find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!existing) throw new Error(`Could not create or find auth user ${email}`);
  await fetch(`${URL}/auth/v1/admin/users/${existing.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ password, email_confirm: true }),
  });
  return existing.id;
}

async function main(): Promise<void> {
  if (!URL || !KEY)
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in apps/api/.env');
  const db = new PrismaClient();
  try {
    await db.tenant.upsert({
      where: { id: TENANT_ID },
      create: { id: TENANT_ID, name: 'Demo Panel & Paint' },
      update: {},
    });

    for (const acc of ACCOUNTS) {
      const userId = await ensureAuthUser(acc.email, acc.password);
      await db.membership.upsert({
        where: { tenantId_userId: { tenantId: TENANT_ID, userId } },
        create: { tenantId: TENANT_ID, userId, role: acc.role },
        update: { role: acc.role },
      });
      // eslint-disable-next-line no-console
      console.log(`✅ ${acc.role.padEnd(5)}  ${acc.email}  /  ${acc.password}   (user ${userId})`);
    }
    // eslint-disable-next-line no-console
    console.log(`\nLinked to tenant ${TENANT_ID}. Use these on the sign-in page.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
