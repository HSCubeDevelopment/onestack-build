// Card 53.1 — geofenced check-in, end to end.
//
// The assertions that matter: a worker at the shop clocks on cleanly, a worker elsewhere is refused
// but CAN override with a reason, an override without a reason is rejected, no coordinates are ever
// written to the database, and the review queue is owner-only.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { WORKSHOP } from '../src/time-clock/geofence';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Time clock — geofenced check-in (card 53.1)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;

  const http = () => request(app.getHttpServer());
  const staff = (t: TestTenant) => ({ Authorization: `Bearer ${t.staffToken}` });
  const owner = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  const AT_WORK = {
    latitude: WORKSHOP.latitude,
    longitude: WORKSHOP.longitude,
    accuracyMetres: 10,
  };
  /** ~5 km north — comfortably outside any sane fence. */
  const AT_HOME = {
    latitude: WORKSHOP.latitude + 0.045,
    longitude: WORKSHOP.longitude,
    accuracyMetres: 10,
  };

  /** Clear the caller's open session so each test starts off the clock. */
  const reset = async (t: TestTenant) => {
    await admin.$executeRawUnsafe(
      `DELETE FROM "onestack_time_entry" WHERE "tenantId" = $1::uuid`,
      t.tenantId,
    );
  };

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Geo A');
    b = await makeTenant(admin, 'Geo B');
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a, b]) {
      await reset(t);
      await dropTenant(admin, t.tenantId);
    }
    await admin.$disconnect();
  });

  it('lets a worker at the workshop check in cleanly', async () => {
    await reset(a);
    const res = await http()
      .post('/api/v1/time-clock/check-in')
      .set(staff(a))
      .send({ position: AT_WORK })
      .expect(200);
    expect(res.body.onClock).toBe(true);

    const [row] = await admin.$queryRawUnsafe<
      { geofenceVerdict: string; geofenceOverridden: boolean; geofenceDistanceMetres: number }[]
    >(
      `SELECT "geofenceVerdict","geofenceOverridden","geofenceDistanceMetres"
       FROM "onestack_time_entry" WHERE "tenantId" = $1::uuid`,
      a.tenantId,
    );
    expect(row?.geofenceVerdict).toBe('inside');
    expect(row?.geofenceOverridden).toBe(false);
    expect(row?.geofenceDistanceMetres).toBeLessThan(WORKSHOP.radiusMetres);
  });

  it('refuses a worker who is somewhere else, and tells them they can override', async () => {
    await reset(a);
    const res = await http()
      .post('/api/v1/time-clock/check-in')
      .set(staff(a))
      .send({ position: AT_HOME })
      .expect(400);

    expect(res.body.geofence.verdict).toBe('outside');
    // The client needs this to offer the override path instead of a dead end.
    expect(res.body.canOverride).toBe(true);
    expect(res.body.message).toMatch(/Lipton Drive/);
  });

  it('refuses when the phone gives no location at all', async () => {
    await reset(a);
    const res = await http().post('/api/v1/time-clock/check-in').set(staff(a)).send({}).expect(400);
    expect(res.body.geofence.verdict).toBe('unavailable');
    expect(res.body.canOverride).toBe(true);
  });

  it('refuses a fix too imprecise to judge, even when it reads as nearby', async () => {
    await reset(a);
    const res = await http()
      .post('/api/v1/time-clock/check-in')
      .set(staff(a))
      .send({ position: { ...AT_WORK, accuracyMetres: 900 } })
      .expect(400);
    expect(res.body.geofence.verdict).toBe('inaccurate');
  });

  it('allows an override with a reason, and records it for the owner', async () => {
    await reset(a);
    const res = await http()
      .post('/api/v1/time-clock/check-in')
      .set(staff(a))
      .send({ position: AT_HOME, overrideReason: 'Picking up a car from the tow yard' })
      .expect(200);
    expect(res.body.onClock).toBe(true);

    const [row] = await admin.$queryRawUnsafe<
      { geofenceOverridden: boolean; geofenceOverrideReason: string; geofenceVerdict: string }[]
    >(
      `SELECT "geofenceOverridden","geofenceOverrideReason","geofenceVerdict"
       FROM "onestack_time_entry" WHERE "tenantId" = $1::uuid`,
      a.tenantId,
    );
    expect(row?.geofenceOverridden).toBe(true);
    expect(row?.geofenceOverrideReason).toMatch(/tow yard/);
    // The verdict is preserved, so the owner sees WHY it needed overriding.
    expect(row?.geofenceVerdict).toBe('outside');
  });

  it('rejects an override with no real reason', async () => {
    await reset(a);
    await http()
      .post('/api/v1/time-clock/check-in')
      .set(staff(a))
      .send({ position: AT_HOME, overrideReason: 'x' })
      .expect(400);
  });

  it('NEVER stores coordinates — only a distance and a verdict', async () => {
    // The privacy guarantee, asserted against the real table rather than trusted.
    await reset(a);
    await http()
      .post('/api/v1/time-clock/check-in')
      .set(staff(a))
      .send({ position: AT_WORK })
      .expect(200);

    const cols = await admin.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'onestack_time_entry'`,
    );
    const names = cols.map((c) => c.column_name.toLowerCase()).join(',');
    expect(names).not.toMatch(/lat|lon|coord|position/);

    // And no row carries the actual numbers anywhere.
    const rows = await admin.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT * FROM "onestack_time_entry" WHERE "tenantId" = $1::uuid`,
      a.tenantId,
    );
    expect(JSON.stringify(rows)).not.toContain(String(WORKSHOP.latitude));
    expect(JSON.stringify(rows)).not.toContain(String(WORKSHOP.longitude));
  });

  it('keeps the override review queue away from employees', async () => {
    // This is the data that becomes surveillance if peers can read it.
    await http().get('/api/v1/time-clock/overrides').set(staff(a)).expect(403);
    await http().get('/api/v1/time-clock/overrides').set(owner(a)).expect(200);
  });

  it('is tenant-isolated: shop B’s owner sees none of shop A’s overrides', async () => {
    await reset(a);
    await http()
      .post('/api/v1/time-clock/check-in')
      .set(staff(a))
      .send({ position: AT_HOME, overrideReason: 'Off site for a tow' })
      .expect(200);

    const mine = await http().get('/api/v1/time-clock/overrides').set(owner(a)).expect(200);
    expect(mine.body.length).toBeGreaterThan(0);

    const theirs = await http().get('/api/v1/time-clock/overrides').set(owner(b)).expect(200);
    expect(theirs.body).toEqual([]);
  });
});
