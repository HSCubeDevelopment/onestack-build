// 40.8 — financials access control, end to end against Supabase.
// Proves: money (/finance/overview) is OWNER-only by default; an owner can GRANT a staff member
// finance access so they can see it; revoking takes effect immediately.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Financials access control (40.8)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  const http = () => request(app.getHttpServer());
  const owner = () => ({ Authorization: `Bearer ${a.ownerToken}` });
  const staff = () => ({ Authorization: `Bearer ${a.staffToken}` });

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Finance A');
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await dropTenant(admin, a.tenantId);
    await admin.$disconnect();
  });

  it('hides money from staff by default; owner can grant + revoke finance access', async () => {
    // Owner always sees money.
    await http().get('/api/v1/finance/overview').set(owner()).expect(200);
    // Staff cannot, by default.
    await http().get('/api/v1/finance/overview').set(staff()).expect(403);

    // Staff's own permissions report no finance access.
    expect(
      (await http().get('/api/v1/auth/permissions').set(staff()).expect(200)).body.canViewFinance,
    ).toBe(false);
    // Owner's permissions always report finance access.
    expect(
      (await http().get('/api/v1/auth/permissions').set(owner()).expect(200)).body.canViewFinance,
    ).toBe(true);

    // The directory shows the owner + staff, staff without finance.
    const dir = (await http().get('/api/v1/auth/directory').set(owner()).expect(200)).body as {
      userId: string;
      role: string;
      canViewFinance: boolean;
    }[];
    const staffRow = dir.find((m) => m.userId === a.staffUserId);
    expect(staffRow?.canViewFinance).toBe(false);
    expect(dir.find((m) => m.userId === a.ownerUserId)?.canViewFinance).toBe(true);

    // Staff cannot grant themselves access (owner-only endpoint).
    await http()
      .patch(`/api/v1/auth/members/${a.staffUserId}/finance`)
      .set(staff())
      .send({ canViewFinance: true })
      .expect(403);

    // Owner grants the staff member finance access.
    await http()
      .patch(`/api/v1/auth/members/${a.staffUserId}/finance`)
      .set(owner())
      .send({ canViewFinance: true })
      .expect(200);

    // Now the staff member can see money, immediately (no re-login).
    await http().get('/api/v1/finance/overview').set(staff()).expect(200);
    expect(
      (await http().get('/api/v1/auth/permissions').set(staff()).expect(200)).body.canViewFinance,
    ).toBe(true);

    // Owner revokes → staff is locked out again.
    await http()
      .patch(`/api/v1/auth/members/${a.staffUserId}/finance`)
      .set(owner())
      .send({ canViewFinance: false })
      .expect(200);
    await http().get('/api/v1/finance/overview').set(staff()).expect(403);
  });
});
