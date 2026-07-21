import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { PackRegistry } from '../core/pack-registry';
import { WorkflowEngine, WorkflowError } from '../core/workflow.engine';
import { SitesService } from '../sites/sites.service';
import { TenantService } from '../tenancy/tenant.service';

export interface CreateWorkItemInput {
  type: string;
  fields?: Record<string, unknown>;
  assignees?: string[];
  subjectIds?: string[];
  siteId?: string | null; // SITE-1: the location this job belongs to (optional)
}

export interface WorkItemView {
  id: string;
  type: string;
  reference: string;
  stateName: string;
  workflowVersion: number;
  assignees: string[];
  fields: Record<string, unknown>;
  siteId: string | null; // SITE-1
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The generic Work Item engine (card #6.3). One engine serves every vertical: the automotive "job" and
 * the physio "appointment" are the SAME table + service, differing only by pack `type` + config.
 * State changes go ONLY through `transition` (the workflow engine) — `update` cannot touch state.
 */
@Injectable()
export class WorkItemService {
  constructor(
    private readonly tenants: TenantService,
    private readonly registry: PackRegistry,
    private readonly workflow: WorkflowEngine,
    private readonly events: EventEmitter2,
    private readonly audit: AuditService,
    private readonly sites: SitesService,
  ) {}

  async create(tenantId: string, input: CreateWorkItemInput): Promise<WorkItemView> {
    const def = this.workItemTypeOrThrow(input.type);
    const fields = this.validateFields(def.fields, input.fields ?? {});
    const initial = this.workflow.initialState(def.workflow);
    const workflowVersion = def.workflow.version;

    if (def.requiresSubject && (input.subjectIds ?? []).length === 0) {
      throw new BadRequestException(`A "${input.type}" requires at least one linked subject`);
    }
    // SITE-1: a job may be tagged with a location. Validate through the sites module (owns the table),
    // which reads under RLS — so a cross-tenant or soft-deleted site id is rejected, never stored.
    if (input.siteId) await this.sites.assertInTenant(tenantId, input.siteId);

    return this.tenants.runInTenant(tenantId, async (tx) => {
      const counter = await tx.workItemCounter.upsert({
        where: { tenantId },
        create: { tenantId, value: 1 },
        update: { value: { increment: 1 } },
      });
      const prefix = def.referencePrefix ?? 'WI';
      const reference = `${prefix}-${String(counter.value).padStart(6, '0')}`;

      const wi = await tx.workItem.create({
        data: {
          tenantId,
          type: input.type,
          stateName: initial,
          workflowVersion,
          reference,
          assignees: (input.assignees ?? []) as Prisma.InputJsonValue,
          fields: fields as Prisma.InputJsonValue,
          siteId: input.siteId ?? null,
        },
      });

      for (const subjectId of input.subjectIds ?? []) {
        await tx.workItemSubject.create({ data: { tenantId, workItemId: wi.id, subjectId } });
      }
      return toView(wi);
    });
  }

  /**
   * `assignedTo` restricts to work items that user is an assignee of. Callers pass it for the employee
   * (STAFF) role so a worker only ever receives their own jobs — the rows never leave the server, rather
   * than being filtered in the client. Omit it for OWNER.
   */
  async get(tenantId: string, id: string, assignedTo?: string): Promise<WorkItemView> {
    const wi = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.workItem.findFirst({
        where: {
          id,
          deletedAt: null,
          ...(assignedTo ? { assignees: { array_contains: assignedTo } } : {}),
        },
      }),
    );
    // Deliberately 404, not 403: a worker shouldn't be able to probe which job ids exist.
    if (!wi) throw new NotFoundException('Work item not found');
    return toView(wi);
  }

  /**
   * List work items, optionally filtered by type (e.g. all "job" work items). This tenant only.
   * `siteId` (SITE-1) narrows to one location; pass the sentinel `'none'` for jobs with no site yet.
   */
  async list(
    tenantId: string,
    type?: string,
    assignedTo?: string,
    siteId?: string,
  ): Promise<WorkItemView[]> {
    const rows = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.workItem.findMany({
        where: {
          deletedAt: null,
          ...(type ? { type } : {}),
          ...(assignedTo ? { assignees: { array_contains: assignedTo } } : {}),
          ...(siteId ? { siteId: siteId === 'none' ? null : siteId } : {}),
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
    return rows.map(toView);
  }

  /**
   * Every work item linked to a given subject, newest first (card 11.1 — "pull up a car").
   *
   * Exposed as a service method rather than letting callers query `onestack_work_item_subject`
   * themselves: that join table belongs to this module, and §5 says modules talk through services, not
   * each other's tables. Tenant-scoped like every other read here.
   */
  async listForSubject(tenantId: string, subjectId: string): Promise<WorkItemView[]> {
    const rows = await this.tenants.runInTenant(tenantId, async (tx) => {
      const links = await tx.workItemSubject.findMany({
        where: { subjectId },
        select: { workItemId: true },
      });
      if (links.length === 0) return [];
      return tx.workItem.findMany({
        where: { id: { in: links.map((l) => l.workItemId) }, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
    });
    return rows.map(toView);
  }

  /** Update mutable fields/assignees. CANNOT change state — that is `transition` only (card #6.3). */
  async update(
    tenantId: string,
    id: string,
    patch: {
      fields?: Record<string, unknown>;
      assignees?: string[];
      siteId?: string | null;
      expectedVersion: number;
    },
  ): Promise<WorkItemView> {
    // SITE-1: reassigning a job to a location validates the site the same way create does.
    if (patch.siteId) await this.sites.assertInTenant(tenantId, patch.siteId);
    await this.tenants.runInTenant(tenantId, async (tx) => {
      const current = await tx.workItem.findFirst({ where: { id, deletedAt: null } });
      if (!current) throw new NotFoundException('Work item not found');
      const def = this.workItemTypeOrThrow(current.type);
      const nextFields =
        patch.fields !== undefined ? this.validateFields(def.fields, patch.fields) : undefined;

      // Unchecked variant so the raw `siteId` FK scalar can be set directly (SITE-1); it's part of the
      // `site` relation, which the restricted UpdateManyMutationInput omits.
      const data: Prisma.WorkItemUncheckedUpdateManyInput = { version: { increment: 1 } };
      if (nextFields !== undefined) data.fields = nextFields as Prisma.InputJsonValue;
      if (patch.assignees !== undefined) data.assignees = patch.assignees as Prisma.InputJsonValue;
      if (patch.siteId !== undefined) data.siteId = patch.siteId;
      const res = await tx.workItem.updateMany({
        where: { id, version: patch.expectedVersion, deletedAt: null },
        data,
      });
      if (res.count !== 1) throw new ConflictException('Work item was modified concurrently');
    });
    // Read AFTER the write transaction commits — a nested read runs on a different pooled connection
    // and would otherwise return the pre-update snapshot (same reason `assign` reads outside its tx).
    return this.get(tenantId, id);
  }

  /**
   * The ONLY way state changes. Resolves the workflow at the item's PINNED version (a pack update never
   * strands in-flight items), enforces the transition, bumps version optimistically, and fires the
   * transition's side-effect actions as events.
   */
  async transition(tenantId: string, id: string, event: string): Promise<WorkItemView> {
    const fired = await this.tenants.runInTenant(tenantId, async (tx) => {
      const wi = await tx.workItem.findFirst({ where: { id, deletedAt: null } });
      if (!wi) throw new NotFoundException('Work item not found');

      const def = this.registry.getWorkflow(wi.type, wi.workflowVersion); // pinned version
      let result: { nextState: string; actions: string[] };
      try {
        result = this.workflow.transition(
          def,
          wi.stateName,
          event,
          wi.fields as Record<string, unknown>,
        );
      } catch (e) {
        if (e instanceof WorkflowError) throw new BadRequestException(e.message);
        throw e;
      }

      const upd = await tx.workItem.updateMany({
        where: { id, version: wi.version, deletedAt: null },
        data: { stateName: result.nextState, version: { increment: 1 } },
      });
      if (upd.count !== 1) throw new ConflictException('Work item was modified concurrently');
      return { actions: result.actions, nextState: result.nextState };
    });

    // Side-effects as events (durable outbox #9.15 comes later; this is the in-process seam).
    for (const action of fired.actions) {
      this.events.emit('workflow.action', {
        action,
        tenantId,
        workItemId: id,
        state: fired.nextState,
      });
    }
    return this.get(tenantId, id);
  }

  /**
   * INS-2 override: an owner releases a held job for collection despite an unpaid customer excess
   * ("collect excess before release, or override with permission"). Clears the `excessOutstanding`
   * flag the pack's COLLECT guard reads, and records WHO waived it and when — an audited exception,
   * not a silent bypass. Owner-only is enforced at the controller.
   */
  async waiveExcessHold(tenantId: string, userId: string, id: string): Promise<WorkItemView> {
    await this.tenants.runInTenant(tenantId, async (tx) => {
      const wi = await tx.workItem.findFirst({ where: { id, deletedAt: null } });
      if (!wi) throw new NotFoundException('Work item not found');
      const fields = { ...(wi.fields as Record<string, unknown>), excessOutstanding: false };
      await tx.workItem.update({
        where: { id },
        data: { fields: fields as Prisma.InputJsonValue },
      });
      await this.audit.recordIn(tx, {
        tenantId,
        actorUserId: userId,
        action: 'job.excess_hold.waived',
        entityType: 'work_item',
        entityId: id,
      });
    });
    return this.get(tenantId, id);
  }

  /**
   * Assign (or clear) the staff members working a job (card #21). Each id MUST be a member of THIS
   * tenant — validated against onestack_membership — so you can't assign another shop's user. In the
   * automotive pack this is the "technician" via the Terminology layer; the engine stays generic.
   */
  async assign(tenantId: string, id: string, assignees: string[]): Promise<WorkItemView> {
    const unique = [...new Set(assignees)];
    await this.tenants.runInTenant(tenantId, async (tx) => {
      const wi = await tx.workItem.findFirst({ where: { id, deletedAt: null } });
      if (!wi) throw new NotFoundException('Work item not found');
      if (unique.length > 0) {
        const members = await tx.membership.count({ where: { userId: { in: unique } } });
        if (members !== unique.length)
          throw new BadRequestException('One or more assignees are not staff of this shop');
      }
      await tx.workItem.updateMany({
        where: { id, deletedAt: null },
        data: { assignees: unique as Prisma.InputJsonValue, version: { increment: 1 } },
      });
    });
    // Read AFTER the write transaction commits — a nested read runs on a different pooled connection.
    return this.get(tenantId, id);
  }

  async softDelete(tenantId: string, id: string): Promise<void> {
    await this.tenants.runInTenant(tenantId, (tx) =>
      tx.workItem.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } }),
    );
  }

  private workItemTypeOrThrow(type: string) {
    if (!this.registry.hasWorkItemType(type)) {
      throw new BadRequestException(`Unknown work-item type: ${type}`);
    }
    return this.registry.getWorkItemType(type);
  }

  private validateFields(schema: z.ZodTypeAny, fields: unknown): Record<string, unknown> {
    const parsed = schema.safeParse(fields);
    if (!parsed.success) {
      throw new BadRequestException(`Invalid fields: ${parsed.error.message}`);
    }
    return parsed.data as Record<string, unknown>;
  }
}

function toView(wi: {
  id: string;
  type: string;
  reference: string;
  stateName: string;
  workflowVersion: number;
  assignees: unknown;
  fields: unknown;
  siteId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}): WorkItemView {
  return {
    id: wi.id,
    type: wi.type,
    reference: wi.reference,
    stateName: wi.stateName,
    workflowVersion: wi.workflowVersion,
    assignees: (wi.assignees as string[]) ?? [],
    fields: (wi.fields as Record<string, unknown>) ?? {},
    siteId: wi.siteId ?? null,
    version: wi.version,
    createdAt: wi.createdAt,
    updatedAt: wi.updatedAt,
  };
}
