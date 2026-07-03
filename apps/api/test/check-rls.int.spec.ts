// Card #2.2 acceptance: the RLS gate flags a table with a tenantId column that lacks forced RLS + policy.
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findRlsViolations } from '../scripts/check-rls';
import { adminPrisma, hasDb } from './helpers/harness';

describe.skipIf(!hasDb)('RLS CI gate', () => {
  let admin: PrismaClient;

  beforeAll(() => {
    admin = adminPrisma();
  });

  afterAll(async () => {
    await admin.$executeRawUnsafe(`DROP TABLE IF EXISTS "_rls_probe"`);
    await admin.$disconnect();
  });

  it('reports no violations for the real schema', async () => {
    const violations = await findRlsViolations(admin);
    expect(violations).toHaveLength(0);
  });

  it('goes red on a deliberately-misconfigured tenant table', async () => {
    await admin.$executeRawUnsafe(`DROP TABLE IF EXISTS "_rls_probe"`);
    await admin.$executeRawUnsafe(`CREATE TABLE "_rls_probe" ("tenantId" uuid NOT NULL)`);
    const violations = await findRlsViolations(admin);
    expect(violations.map((v) => v.table)).toContain('_rls_probe');
    await admin.$executeRawUnsafe(`DROP TABLE IF EXISTS "_rls_probe"`);
  });
});
