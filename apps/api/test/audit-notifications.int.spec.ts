// Cards #9.2 (immutable audit trail) and #9.1 (notifications engine). Against Supabase.
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditService } from '../src/audit/audit.service';
import { NotificationService } from '../src/notifications/notification.service';
import { TenantService } from '../src/tenancy/tenant.service';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('audit + notifications', () => {
  let admin: PrismaClient;
  let tenants: TenantService;
  let audit: AuditService;
  let notifications: NotificationService;
  let a: TestTenant;
  let b: TestTenant;

  beforeAll(async () => {
    admin = adminPrisma();
    tenants = new TenantService();
    audit = new AuditService(tenants);
    notifications = new NotificationService(tenants);
    a = await makeTenant(admin, 'AN A');
    b = await makeTenant(admin, 'AN B');
  });

  afterAll(async () => {
    for (const t of [a.tenantId, b.tenantId]) {
      await admin.$executeRawUnsafe(
        `DELETE FROM "onestack_audit_log" WHERE "tenantId" = $1::uuid`,
        t,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM "onestack_notification" WHERE "tenantId" = $1::uuid`,
        t,
      );
    }
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  it('records an audit entry, isolates it by tenant, and is append-only (no update/delete)', async () => {
    await audit.record({
      tenantId: a.tenantId,
      actorUserId: a.ownerUserId,
      action: 'contact.created',
      entityType: 'contact',
      entityId: '00000000-0000-0000-0000-000000000001',
    });

    const forA = await audit.list(a.tenantId);
    expect(forA.map((e) => e.action)).toContain('contact.created');

    // Tenant B sees none of A's audit entries.
    const forB = await audit.list(b.tenantId);
    expect(forB.find((e) => e.action === 'contact.created')).toBeUndefined();

    // Immutable: the app role cannot UPDATE or DELETE audit rows.
    const id = forA[0]!.id;
    await expect(
      tenants.runInTenant(a.tenantId, (tx) =>
        tx.auditLog.updateMany({ where: { id }, data: { action: 'tampered' } }),
      ),
    ).rejects.toThrow();
    await expect(
      tenants.runInTenant(a.tenantId, (tx) => tx.auditLog.deleteMany({ where: { id } })),
    ).rejects.toThrow();
  });

  it('enqueues and delivers notifications across channels, tenant-isolated', async () => {
    await notifications.enqueue({
      tenantId: a.tenantId,
      channel: 'in_app',
      recipient: a.ownerUserId,
      template: 'welcome',
    });
    await notifications.enqueue({
      tenantId: a.tenantId,
      channel: 'email',
      recipient: 'owner@example.com',
      template: 'welcome',
    });

    const res = await notifications.deliverPending(a.tenantId);
    expect(res.sent).toBe(2);
    expect(res.failed).toBe(0);

    // Tenant B has nothing to deliver and can't see A's notifications.
    const resB = await notifications.deliverPending(b.tenantId);
    expect(resB.sent).toBe(0);
    const bRows = await tenants.runInTenant(b.tenantId, (tx) => tx.notification.findMany());
    expect(bRows).toHaveLength(0);
  });
});
