// Reusable test harness (card #5). Every future card copies this pattern.
// See docs/testing.md for how to write a tenant-isolation test.
import { PrismaClient, Role } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as jwt from 'jsonwebtoken';
import type { AppRole } from '../../src/auth/auth.types';

/** Integration tests only run when a real (Supabase) DB is configured. */
export const hasDb = Boolean(process.env.DATABASE_URL && process.env.APP_DATABASE_URL);

/** Admin/owner client (DATABASE_URL) — BYPASSRLS on Supabase; used to provision + assert across tenants. */
export function adminPrisma(): PrismaClient {
  return new PrismaClient();
}

export function signToken(p: { userId: string; tenantId: string; role: AppRole }): string {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) throw new Error('SUPABASE_JWT_SECRET not set');
  return jwt.sign({ sub: p.userId, tenant_id: p.tenantId, role: p.role }, secret, {
    expiresIn: '10m',
  });
}

export interface TestTenant {
  tenantId: string;
  ownerUserId: string;
  staffUserId: string;
  ownerToken: string;
  staffToken: string;
}

/** Provision a tenant with an OWNER and a STAFF member, and mint tokens for each. */
export async function makeTenant(admin: PrismaClient, name: string): Promise<TestTenant> {
  const tenant = await admin.tenant.create({ data: { name } });
  const ownerUserId = randomUUID();
  const staffUserId = randomUUID();
  await admin.membership.create({
    data: { tenantId: tenant.id, userId: ownerUserId, role: Role.OWNER },
  });
  await admin.membership.create({
    data: { tenantId: tenant.id, userId: staffUserId, role: Role.STAFF },
  });
  return {
    tenantId: tenant.id,
    ownerUserId,
    staffUserId,
    ownerToken: signToken({ userId: ownerUserId, tenantId: tenant.id, role: 'OWNER' }),
    staffToken: signToken({ userId: staffUserId, tenantId: tenant.id, role: 'STAFF' }),
  };
}

/**
 * Remove a tenant and its rows (admin/bypass). Safe to call in afterAll.
 *
 * Audit logs, notifications and outbox events are written as SIDE EFFECTS by many modules, so no
 * individual spec creates them deliberately and none cleans them up — but they hold a tenantId FK, so
 * leaving them makes the tenant delete fail. They're cleared here rather than in each spec because the
 * spec that triggered them usually doesn't know it did.
 *
 * A spec that creates its own domain rows (work items, subjects, invoices…) still clears those itself,
 * before calling this — those have real FK ordering that only the spec knows.
 */
export async function dropTenant(admin: PrismaClient, tenantId: string): Promise<void> {
  await admin.auditLog.deleteMany({ where: { tenantId } });
  await admin.notification.deleteMany({ where: { tenantId } });
  await admin.outboxEvent.deleteMany({ where: { tenantId } });
  await admin.contact.deleteMany({ where: { tenantId } });
  await admin.membership.deleteMany({ where: { tenantId } });
  await admin.tenant.deleteMany({ where: { id: tenantId } });
}
