import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantService } from '../tenancy/tenant.service';

/**
 * The saved photo-estimate draft store (owns onestack_estimate_draft). Keeps ONE current draft per job so
 * an employee's instant estimate can be reopened and edited in place: saving again UPDATES the same row
 * rather than piling up copies. The full structured estimate lives in `data` (opaque here) so it round-
 * trips into the same editor. Draft only — this never becomes a formal money quote. Tenant-scoped via
 * runInTenant; kept self-contained so it imports no other module's files (§5).
 */

export interface EstimateDraftInput {
  workItemId: string;
  rego?: string;
  summary?: string;
  data?: unknown; // the full structured estimate (stored opaquely)
  photoCount?: number;
  source?: string; // 'ai' | 'manual'
  model?: string;
}

export interface EstimateDraftView {
  id: string;
  workItemId: string;
  rego: string;
  summary: string;
  data: Record<string, unknown>;
  photoCount: number;
  source: string;
  model: string;
  status: string;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class EstimateDraftService {
  constructor(private readonly tenants: TenantService) {}

  /** Create the job's draft, or update it in place if one already exists (true reopen-and-edit). */
  async upsertForJob(
    tenantId: string,
    userId: string | null,
    input: EstimateDraftInput,
  ): Promise<EstimateDraftView> {
    const data = (input.data ?? {}) as Prisma.InputJsonValue;
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const existing = await tx.estimateDraft.findFirst({
        where: { workItemId: input.workItemId },
        orderBy: { updatedAt: 'desc' },
      });
      const fields = {
        rego: input.rego ?? existing?.rego ?? '',
        summary: input.summary ?? '',
        data,
        photoCount: input.photoCount ?? 0,
        source: input.source ?? 'ai',
        model: input.model ?? '',
      };
      const row = existing
        ? await tx.estimateDraft.update({ where: { id: existing.id }, data: fields })
        : await tx.estimateDraft.create({
            data: { tenantId, workItemId: input.workItemId, createdByUserId: userId, ...fields },
          });
      return toView(row);
    });
  }

  /** The job's current draft, or null if it has none. */
  async getForJob(tenantId: string, workItemId: string): Promise<EstimateDraftView | null> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const row = await tx.estimateDraft.findFirst({
        where: { workItemId },
        orderBy: { updatedAt: 'desc' },
      });
      return row ? toView(row) : null;
    });
  }
}

interface EstimateDraftRow {
  id: string;
  workItemId: string;
  rego: string;
  summary: string;
  data: unknown;
  photoCount: number;
  source: string;
  model: string;
  status: string;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toView(r: EstimateDraftRow): EstimateDraftView {
  return {
    id: r.id,
    workItemId: r.workItemId,
    rego: r.rego,
    summary: r.summary,
    data: r.data && typeof r.data === 'object' ? (r.data as Record<string, unknown>) : {},
    photoCount: r.photoCount,
    source: r.source,
    model: r.model,
    status: r.status,
    createdByUserId: r.createdByUserId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
