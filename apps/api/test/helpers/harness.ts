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

/** Remove a tenant and its rows (admin/bypass). Safe to call in afterAll. */
export async function dropTenant(admin: PrismaClient, tenantId: string): Promise<void> {
  await admin.contact.deleteMany({ where: { tenantId } });
  await admin.membership.deleteMany({ where: { tenantId } });
  await admin.tenant.deleteMany({ where: { id: tenantId } });
}
