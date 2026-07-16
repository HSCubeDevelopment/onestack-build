// Cards #6 + #6.2: per-tenant feature flags, tenant-isolated, enforced server-side (routes + events).
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EventBus } from '../src/composition/event-bus';
import { FeatureFlagService } from '../src/composition/feature-flag.service';
import { createApp } from '../src/main';
import { TenantService } from '../src/tenancy/tenant.service';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('feature flags (composition engine)', () => {
  let admin: PrismaClient;
  let tenants: TenantService;
  let flags: FeatureFlagService;
  let app: INestApplication;
  let a: TestTenant;
  let b: TestTenant;

  beforeAll(async () => {
    admin = adminPrisma();
    tenants = new TenantService();
    flags = new FeatureFlagService(tenants);
    a = await makeTenant(admin, 'Flags A');
    b = await makeTenant(admin, 'Flags B');
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await admin.$executeRawUnsafe(
      `DELETE FROM "onestack_feature_flag" WHERE "tenantId" IN ($1::uuid, $2::uuid)`,
      a.tenantId,
      b.tenantId,
    );
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  it('defaults come from the registry, overrides are per-tenant and isolated', async () => {
    expect(await flags.isEnabled(a.tenantId, 'scheduling')).toBe(false); // default off
    expect(await flags.isEnabled(a.tenantId, 'contacts')).toBe(true); // default on

    await flags.setEnabled(a.tenantId, 'scheduling', true);
    expect(await flags.isEnabled(a.tenantId, 'scheduling')).toBe(true);
    // Tenant B is unaffected — flags are tenant-scoped.
    expect(await flags.isEnabled(b.tenantId, 'scheduling')).toBe(false);
  });

  it('enforces flags on HTTP routes (OFF → 404, ON → 200)', async () => {
    const http = () => request(app.getHttpServer());
    // Tenant B has scheduling OFF → route behaves as if it does not exist.
    await http()
      .get('/api/v1/scheduling/ping')
      .set('Authorization', `Bearer ${b.ownerToken}`)
      .expect(404);

    // Tenant A enabled it above → reachable.
    await http()
      .get('/api/v1/scheduling/ping')
      .set('Authorization', `Bearer ${a.ownerToken}`)
      .expect(200);
  });

  it("a disabled module's event consumers do not fire", async () => {
    const bus = new EventBus(flags);
    const seen: string[] = [];
    bus.subscribe('scheduling', 'appointment.requested', (e) => {
      seen.push(e.tenantId);
    });

    // B: scheduling OFF → consumer must not fire.
    await bus.publish({ type: 'appointment.requested', tenantId: b.tenantId, payload: {} });
    expect(seen).not.toContain(b.tenantId);

    // A: scheduling ON → consumer fires.
    await bus.publish({ type: 'appointment.requested', tenantId: a.tenantId, payload: {} });
    expect(seen).toContain(a.tenantId);
  });
});
