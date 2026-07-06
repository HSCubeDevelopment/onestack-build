// Seed the stable demo tenant used by the web frontend's dev login (walking skeleton, card #4).
// Idempotent: creates the demo tenant + an OWNER membership + turns the scheduling module ON.
// Run: DATABASE_URL="…" npx tsx scripts/seed-demo-web.ts
import { PrismaClient, Role } from '@prisma/client';

const TENANT_ID = '0d15ea5e-0000-4000-8000-000000000001';
const OWNER_USER_ID = '0d15ea5e-0000-4000-8000-000000000002';

async function main() {
  const db = new PrismaClient();
  try {
    await db.tenant.upsert({
      where: { id: TENANT_ID },
      create: { id: TENANT_ID, name: 'Demo Panel & Paint' },
      update: { name: 'Demo Panel & Paint' },
    });
    await db.membership.upsert({
      where: { tenantId_userId: { tenantId: TENANT_ID, userId: OWNER_USER_ID } },
      create: { tenantId: TENANT_ID, userId: OWNER_USER_ID, role: Role.OWNER },
      update: { role: Role.OWNER },
    });
    await db.featureFlag.upsert({
      where: { tenantId_key: { tenantId: TENANT_ID, key: 'scheduling' } },
      create: { tenantId: TENANT_ID, key: 'scheduling', enabled: true },
      update: { enabled: true },
    });
    // eslint-disable-next-line no-console
    console.log(`✅ Seeded demo tenant ${TENANT_ID} (owner ${OWNER_USER_ID}), scheduling ON`);
  } finally {
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
