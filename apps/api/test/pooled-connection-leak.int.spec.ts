// Card #2.1 acceptance: a concurrency test with a small pool + parallel tenants proves NO cross-tenant
// bleed, and bypassing the transaction-LOCAL pattern (a session SET) is shown to leak.
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantService } from '../src/tenancy/tenant.service';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('pooled-connection leak', () => {
  let admin: PrismaClient;
  let tenants: TenantService;
  let a: TestTenant;
  let b: TestTenant;

  beforeAll(async () => {
    admin = adminPrisma();
    tenants = new TenantService();
    a = await makeTenant(admin, 'Leak A');
    b = await makeTenant(admin, 'Leak B');
  });

  afterAll(async () => {
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  it('the LOCAL setting does not survive the transaction (no session leak)', async () => {
    await tenants.runInTenant(a.tenantId, async (tx) => {
      const inside = await tx.$queryRaw<{ v: string }[]>`
        SELECT current_setting('app.current_tenant_id', true) AS v`;
      expect(inside[0]?.v).toBe(a.tenantId);
    });
    // After commit, a fresh checkout from the pool must NOT carry A's tenant id.
    expect(await tenants.currentTenantIdOutsideTransaction()).toBe('');
  });

  it('parallel tenants on a small pool never see each other', async () => {
    // Seed one contact per tenant.
    await tenants.runInTenant(a.tenantId, (tx) =>
      tx.contact.create({ data: { tenantId: a.tenantId, displayName: 'only-A' } }),
    );
    await tenants.runInTenant(b.tenantId, (tx) =>
      tx.contact.create({ data: { tenantId: b.tenantId, displayName: 'only-B' } }),
    );

    // Hammer both tenants concurrently; each run must see ONLY its own contact.
    const runs = Array.from({ length: 40 }, (_, i) => {
      const t = i % 2 === 0 ? a : b;
      const expected = i % 2 === 0 ? 'only-A' : 'only-B';
      return tenants.runInTenant(t.tenantId, async (tx) => {
        const rows = await tx.contact.findMany();
        return rows.length === 1 && rows[0]?.displayName === expected;
      });
    });
    const results = await Promise.all(runs);
    expect(results.every(Boolean)).toBe(true);
  });

  it('demonstrates session SET leaks but LOCAL does not (proves the test has teeth)', async () => {
    // Pin ONE direct connection so the semantics are deterministic (no pooler/pool-identity noise).
    const url = process.env.DIRECT_URL as string;
    const single = new PrismaClient({
      datasourceUrl: url + (url.includes('?') ? '&' : '?') + 'connection_limit=1',
    });
    try {
      // A plain session SET persists to the NEXT statement on the same connection — this is the leak.
      await single.$executeRawUnsafe(`SET app.current_tenant_id = 'leaky-value'`);
      const afterSet = await single.$queryRaw<{ v: string }[]>`
        SELECT current_setting('app.current_tenant_id', true) AS v`;
      expect(afterSet[0]?.v).toBe('leaky-value');

      // set_config(..., true) INSIDE a transaction is LOCAL — it does NOT persist after commit.
      await single.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', 'local-value', true)`;
      });
      const afterLocal = await single.$queryRaw<{ v: string }[]>`
        SELECT current_setting('app.current_tenant_id', true) AS v`;
      expect(afterLocal[0]?.v).not.toBe('local-value'); // the LOCAL value did not leak out
    } finally {
      await single.$disconnect();
    }
  });
});
