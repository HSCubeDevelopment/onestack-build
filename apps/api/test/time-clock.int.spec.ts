// Time clock — check-in / check-out attendance + OWNER hours summary. Tenant-isolated + role-gated.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Time clock', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;

  const http = () => request(app.getHttpServer());
  const asOwner = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });
  const asStaff = (t: TestTenant) => ({ Authorization: `Bearer ${t.staffToken}` });

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Clock A');
    b = await makeTenant(admin, 'Clock B');
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      await admin.$executeRawUnsafe(
        `DELETE FROM "onestack_time_entry" WHERE "tenantId" = $1::uuid`,
        t,
      );
    }
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  it('checks in, reports on-clock, then checks out with minutes', async () => {
    const inRes = (await http().post('/api/v1/time-clock/check-in').set(asStaff(a)).expect(200))
      .body;
    expect(inRes.onClock).toBe(true);
    expect(inRes.entry.clockOutAt).toBeNull();

    const status = (await http().get('/api/v1/time-clock/status').set(asStaff(a)).expect(200)).body;
    expect(status.onClock).toBe(true);

    const outRes = (await http().post('/api/v1/time-clock/check-out').set(asStaff(a)).expect(200))
      .body;
    expect(outRes.onClock).toBe(false);
    expect(outRes.entry.clockOutAt).not.toBeNull();
    expect(typeof outRes.entry.minutes).toBe('number');
  });

  it('rejects a double check-in and a check-out with no open session', async () => {
    await http().post('/api/v1/time-clock/check-in').set(asOwner(a)).expect(200);
    await http().post('/api/v1/time-clock/check-in').set(asOwner(a)).expect(400); // already checked in
    await http().post('/api/v1/time-clock/check-out').set(asOwner(a)).expect(200);
    await http().post('/api/v1/time-clock/check-out').set(asOwner(a)).expect(400); // not checked in
  });

  it('OWNER summary shows per-staff totals; STAFF is forbidden', async () => {
    const summary = (await http().get('/api/v1/time-clock/summary').set(asOwner(a)).expect(200))
      .body;
    const staffRow = summary.find((r: { userId: string }) => r.userId === a.staffUserId);
    expect(staffRow).toBeDefined();
    expect(staffRow.role).toBe('STAFF');
    expect(staffRow.sessions).toBeGreaterThanOrEqual(1);

    await http().get('/api/v1/time-clock/summary').set(asStaff(a)).expect(403);
  });

  it("is tenant-isolated: shop B's summary and entries never include A's sessions", async () => {
    const summaryB = (await http().get('/api/v1/time-clock/summary').set(asOwner(b)).expect(200))
      .body;
    expect(summaryB.some((r: { userId: string }) => r.userId === a.staffUserId)).toBe(false);
    // B's staff has logged nothing → no closed minutes.
    const entriesB = (await http().get('/api/v1/time-clock/entries').set(asStaff(b)).expect(200))
      .body;
    expect(entriesB).toHaveLength(0);
  });
});
