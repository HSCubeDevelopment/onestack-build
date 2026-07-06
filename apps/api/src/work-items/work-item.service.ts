import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PackRegistry } from '../core/pack-registry';
import { WorkflowEngine, WorkflowError } from '../core/workflow.engine';
import { TenantService } from '../tenancy/tenant.service';

export interface CreateWorkItemInput {
  type: string;
  fields?: Record<string, unknown>;
  assignees?: string[];
  subjectIds?: string[];
}

export interface WorkItemView {
  id: string;
  type: string;
  reference: string;
  stateName: string;
  workflowVersion: number;
  assignees: string[];
  fields: Record<string, unknown>;
  version: number;
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
  ) {}

  async create(tenantId: string, input: CreateWorkItemInput): Promise<WorkItemView> {
    const def = this.workItemTypeOrThrow(input.type);
    const fields = this.validateFields(def.fields, input.fields ?? {});
    const initial = this.workflow.initialState(def.workflow);
    const workflowVersion = def.workflow.version;

    return this.tenants.runInTenant(tenantId, async (tx) => {
      const counter = await tx.workItemCounter.upsert({
        where: { tenantId },
        create: { tenantId, value: 1 },
        update: { value: { increment: 1 } },
      });
      const reference = `WI-${String(counter.value).padStart(6, '0')}`;

      const wi = await tx.workItem.create({
        data: {
          tenantId,
          type: input.type,
          stateName: initial,
          workflowVersion,
          reference,
          assignees: (input.assignees ?? []) as Prisma.InputJsonValue,
          fields: fields as Prisma.InputJsonValue,
        },
      });

      for (const subjectId of input.subjectIds ?? []) {
        await tx.workItemSubject.create({ data: { tenantId, workItemId: wi.id, subjectId } });
      }
      return toView(wi);
    });
  }

  async get(tenantId: string, id: string): Promise<WorkItemView> {
    const wi = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.workItem.findFirst({ where: { id, deletedAt: null } }),
    );
    if (!wi) throw new NotFoundException('Work item not found');
    return toView(wi);
  }

  /** Update mutable fields/assignees. CANNOT change state — that is `transition` only (card #6.3). */
  async update(
    tenantId: string,
    id: string,
    patch: { fields?: Record<string, unknown>; assignees?: string[]; expectedVersion: number },
  ): Promise<WorkItemView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const current = await tx.workItem.findFirst({ where: { id, deletedAt: null } });
      if (!current) throw new NotFoundException('Work item not found');
      const def = this.workItemTypeOrThrow(current.type);
      const nextFields =
        patch.fields !== undefined ? this.validateFields(def.fields, patch.fields) : undefined;

      const data: Prisma.WorkItemUpdateManyMutationInput = { version: { increment: 1 } };
      if (nextFields !== undefined) data.fields = nextFields as Prisma.InputJsonValue;
      if (patch.assignees !== undefined) data.assignees = patch.assignees as Prisma.InputJsonValue;
      const res = await tx.workItem.updateMany({
        where: { id, version: patch.expectedVersion, deletedAt: null },
        data,
      });
      if (res.count !== 1) throw new ConflictException('Work item was modified concurrently');
      return this.get(tenantId, id);
    });
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
  version: number;
}): WorkItemView {
  return {
    id: wi.id,
    type: wi.type,
    reference: wi.reference,
    stateName: wi.stateName,
    workflowVersion: wi.workflowVersion,
    assignees: (wi.assignees as string[]) ?? [],
    fields: (wi.fields as Record<string, unknown>) ?? {},
    version: wi.version,
  };
}
