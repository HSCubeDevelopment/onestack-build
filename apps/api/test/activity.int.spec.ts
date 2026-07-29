// Activity directory — the cross-car feed behind the employee "Car history" screen. It merges courtesy-car
// movements, tickets and jobs newest-first. Read-only; every source is tenant-scoped, so one shop's feed
// can never surface another shop's activity. (Requires the 0052 tickets table, since the feed reads it.)
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Activity directory (cross-car feed)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Activity A');
    b = await makeTenant(admin, 'Activity B');
    app = await createApp();
    await app.init();
    // Shop A records a courtesy-car movement — a car in, a loan car out.
    await http()
      .post('/api/v1/fleet/movements')
      .set(auth(a))
      .send({ driverName: 'Jo', carsInRego: 'inn01', carsOutRego: 'out01', purpose: 'COURTESY' })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      await admin.$executeRawUnsafe(`DELETE FROM "onestack_ticket" WHERE "tenantId" = $1::uuid`, t);
      await admin.$executeRawUnsafe(
        `DELETE FROM "onestack_fleet_movement" WHERE "tenantId" = $1::uuid`,
        t,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM "onestack_fleet_vehicle" WHERE "tenantId" = $1::uuid`,
        t,
      );
    }
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  it("shows A's movement as in/out rows and stays isolated from B", async () => {
    const feed = (await http().get('/api/v1/activity/feed').set(auth(a)).expect(200)).body;
    const kinds = feed.map((e: { kind: string }) => e.kind);
    expect(kinds).toContain('in');
    expect(kinds).toContain('out');
    const inRow = feed.find((e: { kind: string }) => e.kind === 'in');
    expect(inRow.rego.toUpperCase()).toContain('INN01');

    // B's feed is empty — none of A's activity leaks across the tenant boundary.
    expect((await http().get('/api/v1/activity/feed').set(auth(b)).expect(200)).body).toHaveLength(
      0,
    );
  });
});
