// YRD-1 — Yards & vehicle logistics, end to end against Supabase.
// Proves: yards CRUD, drop-at-yard, the "awaiting in yards" list, the dashboard count matching the list,
// staff can park a car but not manage the yard network, and full tenant isolation.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Yards (YRD-1)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;

  const http = () => request(app.getHttpServer());
  const owner = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });
  const staff = (t: TestTenant) => ({ Authorization: `Bearer ${t.staffToken}` });

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Yard A');
    b = await makeTenant(admin, 'Yard B');
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      await admin.$executeRawUnsafe(
        `DELETE FROM "onestack_yard_drop" WHERE "tenantId" = $1::uuid`,
        t,
      );
      await admin.$executeRawUnsafe(`DELETE FROM "onestack_yard" WHERE "tenantId" = $1::uuid`, t);
    }
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  it('creates a yard with coordinates, then parks a car in it', async () => {
    const yard = (
      await http()
        .post('/api/v1/yards')
        .set(owner(a))
        .send({ name: 'Fawkner Depot', latitude: -37.712, longitude: 144.964 })
        .expect(201)
    ).body;
    expect(yard.name).toBe('Fawkner Depot');
    expect(yard.latitude).toBeCloseTo(-37.712, 3);

    const drop = (
      await http()
        .post('/api/v1/yards/drops')
        .set(staff(a)) // a floor worker / tow driver parks the car
        .send({ yardId: yard.id, rego: '7gh 220', comments: 'front-end damage, keys in lockbox' })
        .expect(201)
    ).body;
    expect(drop.rego).toBe('7GH220'); // normalised
    expect(drop.yardName).toBe('Fawkner Depot');
    expect(drop.status).toBe('in_yard');
  });

  it('shows the parked car in "awaiting in yards" and the dashboard count matches', async () => {
    const awaiting = (await http().get('/api/v1/yards/awaiting').set(owner(a)).expect(200)).body;
    expect(awaiting.length).toBeGreaterThan(0);
    expect(awaiting.every((d: { status: string }) => d.status === 'in_yard')).toBe(true);

    const stats = (await http().get('/api/v1/yards/dashboard').set(owner(a)).expect(200)).body;
    expect(stats.inYards).toBe(awaiting.length);

    // The owner dashboard KPI reflects the same count.
    const summary = (await http().get('/api/v1/dashboard/summary').set(owner(a)).expect(200)).body;
    expect(summary.inYards).toBe(awaiting.length);
  });

  it('collecting a car removes it from the awaiting list', async () => {
    const before = (await http().get('/api/v1/yards/awaiting').set(owner(a)).expect(200)).body;
    const target = before[0];
    await http().post(`/api/v1/yards/drops/${target.id}/collect`).set(staff(a)).expect(201);

    const after = (await http().get('/api/v1/yards/awaiting').set(owner(a)).expect(200)).body;
    expect(after.find((d: { id: string }) => d.id === target.id)).toBeUndefined();
  });

  it('lets staff park a car but NOT manage the yard network', async () => {
    // Reads + drops are open to staff.
    await http().get('/api/v1/yards').set(staff(a)).expect(200);
    // Creating/deleting yards is owner-only (RolesGuard default).
    await http().post('/api/v1/yards').set(staff(a)).send({ name: 'Staff Yard' }).expect(403);
  });

  it('rejects a drop into a yard that does not exist', async () => {
    await http()
      .post('/api/v1/yards/drops')
      .set(staff(a))
      .send({ yardId: '00000000-0000-4000-8000-000000000000', rego: 'ABC123' })
      .expect(404);
  });

  it('is tenant-isolated: shop B sees none of A’s yards or parked cars', async () => {
    // B provisions its own yard so the endpoints are exercised, then must see only its own.
    await http().post('/api/v1/yards').set(owner(b)).send({ name: 'B Yard' }).expect(201);

    const bYards = (await http().get('/api/v1/yards').set(owner(b)).expect(200)).body;
    expect(bYards.every((y: { name: string }) => y.name === 'B Yard')).toBe(true);

    expect(
      (await http().get('/api/v1/yards/awaiting').set(owner(b)).expect(200)).body,
    ).toHaveLength(0);
    expect(
      (await http().get('/api/v1/yards/dashboard').set(owner(b)).expect(200)).body.inYards,
    ).toBe(0);

    // And B cannot fetch one of A's drops by id.
    const aAwaiting = (await http().get('/api/v1/yards/awaiting').set(owner(a)).expect(200)).body;
    if (aAwaiting.length > 0) {
      await http().get(`/api/v1/yards/drops/${aAwaiting[0].id}`).set(owner(b)).expect(404);
    }
  });
});
