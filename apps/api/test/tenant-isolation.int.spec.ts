// Card #2 acceptance: "a test proves one tenant cannot read another's data" — read AND write.
// This is THE mandatory test every feature copies. Runs against Supabase (skipped without a DB).
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantService } from '../src/tenancy/tenant.service';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('tenant isolation (RLS)', () => {
  let admin: PrismaClient;
  let tenants: TenantService;
  let a: TestTenant;
  let b: TestTenant;

  beforeAll(async () => {
    admin = adminPrisma();
    tenants = new TenantService();
    a = await makeTenant(admin, 'Tenant A');
    b = await makeTenant(admin, 'Tenant B');
  });

  afterAll(async () => {
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  it('a tenant sees only its own contacts (read isolation)', async () => {
    await tenants.runInTenant(a.tenantId, (tx) =>
      tx.contact.create({ data: { tenantId: a.tenantId, displayName: 'Alice (A)' } }),
    );

    const seenByB = await tenants.runInTenant(b.tenantId, (tx) => tx.contact.findMany());
    expect(seenByB.find((c) => c.displayName === 'Alice (A)')).toBeUndefined();

    const seenByA = await tenants.runInTenant(a.tenantId, (tx) => tx.contact.findMany());
    expect(seenByA.map((c) => c.displayName)).toContain('Alice (A)');
  });

  it('a tenant cannot write a row into another tenant (WITH CHECK)', async () => {
    await expect(
      tenants.runInTenant(b.tenantId, (tx) =>
        // B's context, but trying to stamp A's tenantId → RLS WITH CHECK must reject.
        tx.contact.create({ data: { tenantId: a.tenantId, displayName: 'smuggled' } }),
      ),
    ).rejects.toThrow();
  });

  it('with no tenant context, nothing is visible (safe default)', async () => {
    // Query the app_user client directly without runInTenant → current_setting is NULL → 0 rows.
    const rows = await tenants.unsafeAppClient.contact.findMany();
    expect(rows).toHaveLength(0);
  });
});
