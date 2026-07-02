/**
 * RLS CI gate (card #2.2). Fails the build if any table with a `tenantId` column is missing
 * forced RLS or a policy — a single unprotected tenant table defeats isolation.
 *
 * Run: npm run check:rls  (uses DATABASE_URL — the owner connection, to read the catalog).
 * The check logic is exported so a test can prove it goes red on a deliberately-misconfigured table.
 */
import { PrismaClient } from '@prisma/client';

export interface RlsRow {
  table: string;
  rls_enabled: boolean;
  rls_forced: boolean;
  has_policy: boolean;
}

/** Returns the tenant tables (have a `tenantId` column) that are NOT fully protected. */
export async function findRlsViolations(prisma: PrismaClient): Promise<RlsRow[]> {
  const rows = await prisma.$queryRawUnsafe<RlsRow[]>(`
    SELECT c.relname AS table,
           c.relrowsecurity AS rls_enabled,
           c.relforcerowsecurity AS rls_forced,
           EXISTS (
             SELECT 1 FROM pg_policies p
             WHERE p.schemaname = 'public' AND p.tablename = c.relname
           ) AS has_policy
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND EXISTS (
        SELECT 1 FROM information_schema.columns col
        WHERE col.table_schema = 'public'
          AND col.table_name = c.relname
          AND col.column_name = 'tenantId'
      )
    ORDER BY c.relname;
  `);
  return rows.filter((r) => !(r.rls_enabled && r.rls_forced && r.has_policy));
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const violations = await findRlsViolations(prisma);
    if (violations.length > 0) {
      // eslint-disable-next-line no-console
      console.error('❌ RLS gate FAILED — tenant tables missing forced RLS or a policy:');
      for (const v of violations) {
        // eslint-disable-next-line no-console
        console.error(
          `   - ${v.table}: enabled=${v.rls_enabled} forced=${v.rls_forced} policy=${v.has_policy}`,
        );
      }
      process.exit(1);
    }
    // eslint-disable-next-line no-console
    console.log('✅ RLS gate passed — every tenantId table has forced RLS + a policy.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main();
}
