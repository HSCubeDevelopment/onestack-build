// Phase 4 — Roster & staff management (card #211). Add shifts / time-off, list the roster, remove. Tenant-isolated.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Roster & staff management (Phase 4)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let shiftId: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Roster A');
    b = await makeTenant(admin, 'Roster B');
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      await admin.$executeRawUnsafe(`DELETE FROM "onestack_shift" WHERE "tenantId" = $1::uuid`, t);
    }
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  it('adds a shift and time-off, then lists them', async () => {
    shiftId = (
      await http().post('/api/v1/shifts').set(auth(a)).send({ staffName: 'Alex', startsAt: '2027-03-10T09:00:00.000Z', endsAt: '2027-03-10T17:00:00.000Z' }).expect(201)
    ).body.id;
    await http().post('/api/v1/shifts').set(auth(a)).send({ staffName: 'Sam', kind: 'time_off', startsAt: '2027-03-11T00:00:00.000Z', endsAt: '2027-03-12T00:00:00.000Z' }).expect(201);
    const list = (await http().get('/api/v1/shifts').set(auth(a)).expect(200)).body;
    expect(list).toHaveLength(2);
    expect(list.some((s: { kind: string }) => s.kind === 'time_off')).toBe(true);
  });

  it('rejects a backwards range', async () => {
    await http().post('/api/v1/shifts').set(auth(a)).send({ staffName: 'Alex', startsAt: '2027-03-10T17:00:00.000Z', endsAt: '2027-03-10T09:00:00.000Z' }).expect(400);
  });

  it('removes a shift', async () => {
    await http().delete(`/api/v1/shifts/${shiftId}`).set(auth(a)).expect(204);
    expect((await http().get('/api/v1/shifts').set(auth(a)).expect(200)).body).toHaveLength(1);
  });

  it("is tenant-isolated: shop B sees none of A's roster", async () => {
    expect((await http().get('/api/v1/shifts').set(auth(b)).expect(200)).body).toHaveLength(0);
  });
});
