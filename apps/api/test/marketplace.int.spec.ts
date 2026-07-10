// Phase 4 — Integration marketplace (card #253). Browse the catalogue, connect/disconnect per tenant. Tenant-isolated.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Integration marketplace (Phase 4)', () => {
  let app: INestApplication; let admin: PrismaClient; let a: TestTenant; let b: TestTenant;
  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  beforeAll(async () => {
    admin = adminPrisma(); a = await makeTenant(admin, 'Mkt A'); b = await makeTenant(admin, 'Mkt B');
    app = await createApp(); await app.init();
  });
  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId])
      await admin.$executeRawUnsafe(`DELETE FROM "onestack_integration_connection" WHERE "tenantId" = $1::uuid`, t);
    await dropTenant(admin, a.tenantId); await dropTenant(admin, b.tenantId); await admin.$disconnect();
  });

  it('lists the catalogue and connects an integration', async () => {
    const list = (await http().get('/api/v1/integrations').set(auth(a)).expect(200)).body;
    expect(list.length).toBeGreaterThan(3);
    expect(list.every((i: { status: string }) => i.status === 'not_connected')).toBe(true);
    const v = (await http().post('/api/v1/integrations/xero/connect').set(auth(a)).send({ config: { orgId: 'x1' } }).expect(201)).body;
    expect(v.status).toBe('connected');
    const after = (await http().get('/api/v1/integrations').set(auth(a)).expect(200)).body;
    expect(after.find((i: { slug: string }) => i.slug === 'xero').status).toBe('connected');
  });

  it('disconnects and rejects an unknown slug', async () => {
    const v = (await http().post('/api/v1/integrations/xero/disconnect').set(auth(a)).expect(201)).body;
    expect(v.status).toBe('disconnected');
    await http().post('/api/v1/integrations/not-real/connect').set(auth(a)).send({}).expect(400);
  });

  it("is tenant-isolated: shop B's catalogue shows none of A's connections", async () => {
    const list = (await http().get('/api/v1/integrations').set(auth(b)).expect(200)).body;
    expect(list.every((i: { status: string }) => i.status === 'not_connected')).toBe(true);
  });
});
