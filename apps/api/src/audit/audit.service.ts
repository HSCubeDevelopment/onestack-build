import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantClient, TenantService } from '../tenancy/tenant.service';

export interface AuditEntry {
  tenantId: string;
  actorUserId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Immutable who-did-what trail (card #9.2). The audit table grants the app role INSERT + SELECT only
 * (no UPDATE/DELETE — enforced at both the grant and RLS-policy level), so the trail is append-only.
 * Prefer `recordIn` to write the audit row in the SAME transaction as the change being audited.
 */
@Injectable()
export class AuditService {
  constructor(private readonly tenants: TenantService) {}

  async recordIn(tx: TenantClient, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        actorUserId: entry.actorUserId ?? null,
        action: entry.action,
        entityType: entry.entityType ?? null,
        entityId: entry.entityId ?? null,
        metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async record(entry: AuditEntry): Promise<void> {
    await this.tenants.runInTenant(entry.tenantId, (tx) => this.recordIn(tx, entry));
  }

  async list(tenantId: string, limit = 100) {
    return this.tenants.runInTenant(tenantId, (tx) =>
      tx.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit }),
    );
  }
}
