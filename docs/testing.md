# Testing pattern (copy this for every card)

> Card #5. Playwright is the primary E2E/regression firewall; Vitest owns unit + integration.
> **Every feature ships a tenant-isolation test — no exceptions.** No green tests, no merge.

## Layers

| Layer                   | Tool       | Location                         | Needs DB?          | Runs in CI          |
| ----------------------- | ---------- | -------------------------------- | ------------------ | ------------------- |
| Unit                    | Vitest     | `apps/api/src/**/*.test.ts`      | no                 | always              |
| Integration / isolation | Vitest     | `apps/api/test/**/*.int.spec.ts` | **yes** (Supabase) | when DB secrets set |
| Golden flow (E2E)       | Playwright | `apps/api/e2e/*.spec.ts`         | live API           | against staging     |
| RLS gate                | script     | `apps/api/scripts/check-rls.ts`  | yes                | every PR            |

Run locally (from `apps/api`, with `.env` filled):

```bash
npm test          # unit (no DB)
npm run test:int  # integration + tenant isolation (needs Supabase)
npm run check:rls # fails if any tenantId table lacks forced RLS + policy
npm run test:e2e  # Playwright golden flow (needs a live API)
```

## The harness (`test/helpers/harness.ts`)

- `adminPrisma()` — owner/BYPASSRLS client, to provision + assert across tenants.
- `makeTenant(admin, name)` — creates a tenant + OWNER + STAFF members and mints their JWTs.
- `dropTenant(admin, id)` — teardown.
- `signToken({ userId, tenantId, role })` — a Supabase-shaped access token for tests.
- `hasDb` — gate integration specs with `describe.skipIf(!hasDb)`.

## The one test every card must include (tenant isolation)

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TenantService } from '../src/tenancy/tenant.service';
import { adminPrisma, makeTenant, dropTenant, hasDb } from './helpers/harness';

describe.skipIf(!hasDb)('<feature> isolation', () => {
  const admin = adminPrisma();
  const tenants = new TenantService();
  let a, b;
  beforeAll(async () => {
    a = await makeTenant(admin, 'A');
    b = await makeTenant(admin, 'B');
  });
  afterAll(async () => {
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  it("B cannot read A's rows", async () => {
    await tenants.runInTenant(a.tenantId, (tx) =>
      tx.contact.create({ data: { tenantId: a.tenantId, displayName: 'A only' } }),
    );
    const seenByB = await tenants.runInTenant(b.tenantId, (tx) => tx.contact.findMany());
    expect(seenByB.find((c) => c.displayName === 'A only')).toBeUndefined();
  });
});
```

## Rules

- All request-path queries go through `TenantService.runInTenant` — never the admin client.
- Assert **both** read and write isolation (WITH CHECK blocks cross-tenant writes).
- Background jobs must set the same tenant context before any query.
- New tenant table → it must appear protected by `check:rls`, or the build goes red.
