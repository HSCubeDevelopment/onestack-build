import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenantClient, TenantService } from '../tenancy/tenant.service';
import {
  MATERIAL_ORDER_SENDER,
  MaterialOrderSender,
  OrderSendResult,
} from './material-order-sender';
import {
  canDecide,
  canOrder,
  MaterialRequestStatus,
  normaliseLines,
  RawLine,
} from './material-request';

export interface MaterialRequestLineView {
  id: string;
  description: string;
  quantity: number;
  notes: string | null;
  sortOrder: number;
}

export interface MaterialRequestView {
  id: string;
  workItemId: string;
  reference: string;
  status: MaterialRequestStatus;
  requestedByUserId: string;
  decidedByUserId: string | null;
  decisionNote: string | null;
  notes: string | null;
  lines: MaterialRequestLineView[];
}

export interface CreateMaterialRequestInput {
  lines: RawLine[];
  notes?: string;
}

/**
 * Floor ordering (Phase 2). A technician raises a material request for a job; a manager (OWNER) approves
 * or rejects it; an approved request can be ordered — emailed to a supplier through the vendor boundary
 * (no-op until a provider is wired, so nothing is auto-sent). Reads the job through WorkItemService; its
 * own tables are tenant-scoped via the central wrapper. The manager-only gate is enforced at the route.
 */
@Injectable()
export class MaterialRequestService {
  constructor(
    private readonly tenants: TenantService,
    @Inject(MATERIAL_ORDER_SENDER) private readonly sender: MaterialOrderSender,
  ) {}

  async create(
    tenantId: string,
    jobId: string,
    requestedByUserId: string,
    input: CreateMaterialRequestInput,
  ): Promise<MaterialRequestView> {
    const lines = normaliseLines(input.lines, (m) => new BadRequestException(m));

    return this.tenants.runInTenant(tenantId, async (tx) => {
      const job = await tx.workItem.findFirst({ where: { id: jobId, deletedAt: null } });
      if (!job) throw new NotFoundException('Job not found');
      const counter = await tx.referenceCounter.upsert({
        where: { tenantId_scope: { tenantId, scope: 'material_request' } },
        create: { tenantId, scope: 'material_request', value: 1 },
        update: { value: { increment: 1 } },
      });
      const req = await tx.materialRequest.create({
        data: {
          tenantId,
          workItemId: jobId,
          reference: `MR-${String(counter.value).padStart(6, '0')}`,
          status: 'requested',
          requestedByUserId,
          notes: input.notes?.trim() || null,
        },
      });
      for (let idx = 0; idx < lines.length; idx++) {
        const l = lines[idx]!;
        await tx.materialRequestLine.create({
          data: {
            tenantId,
            materialRequestId: req.id,
            description: l.description,
            quantity: l.quantity,
            notes: l.notes,
            sortOrder: idx,
          },
        });
      }
      return this.viewFrom(tx, req.id);
    });
  }

  async listForJob(tenantId: string, jobId: string): Promise<MaterialRequestView[]> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const job = await tx.workItem.findFirst({ where: { id: jobId, deletedAt: null } });
      if (!job) throw new NotFoundException('Job not found');
      const reqs = await tx.materialRequest.findMany({
        where: { workItemId: jobId },
        orderBy: { createdAt: 'desc' },
      });
      return Promise.all(reqs.map((r) => this.viewFrom(tx, r.id)));
    });
  }

  async get(tenantId: string, id: string): Promise<MaterialRequestView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const req = await tx.materialRequest.findFirst({ where: { id } });
      if (!req) throw new NotFoundException('Material request not found');
      return this.viewFrom(tx, id);
    });
  }

  /** Manager decision: approve. Route-gated to OWNER. Only a pending request can be decided. */
  async approve(
    tenantId: string,
    id: string,
    decidedByUserId: string,
    note?: string,
  ): Promise<MaterialRequestView> {
    return this.decide(tenantId, id, decidedByUserId, 'approved', note);
  }

  /** Manager decision: reject. Route-gated to OWNER. */
  async reject(
    tenantId: string,
    id: string,
    decidedByUserId: string,
    note?: string,
  ): Promise<MaterialRequestView> {
    return this.decide(tenantId, id, decidedByUserId, 'rejected', note);
  }

  private async decide(
    tenantId: string,
    id: string,
    decidedByUserId: string,
    decision: 'approved' | 'rejected',
    note?: string,
  ): Promise<MaterialRequestView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const req = await tx.materialRequest.findFirst({ where: { id } });
      if (!req) throw new NotFoundException('Material request not found');
      if (!canDecide(req.status as MaterialRequestStatus)) {
        throw new ConflictException(`A ${req.status} request can no longer be decided`);
      }
      await tx.materialRequest.update({
        where: { id },
        data: { status: decision, decidedByUserId, decisionNote: note?.trim() || null },
      });
      return this.viewFrom(tx, id);
    });
  }

  /**
   * Email an approved request to the supplier — the vendor boundary. With the no-op sender nothing is
   * emailed and the request stays approved; it only advances to 'ordered' once a real send succeeds.
   */
  async order(
    tenantId: string,
    id: string,
  ): Promise<{ request: MaterialRequestView; result: OrderSendResult }> {
    const view = await this.tenants.runInTenant(tenantId, async (tx) => {
      const req = await tx.materialRequest.findFirst({ where: { id } });
      if (!req) throw new NotFoundException('Material request not found');
      if (!canOrder(req.status as MaterialRequestStatus)) {
        throw new ConflictException(
          `Only an approved request can be ordered (this one is ${req.status})`,
        );
      }
      return this.viewFrom(tx, id);
    });

    const job = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.workItem.findFirst({ where: { id: view.workItemId } }),
    );
    const result = await this.sender.send({
      reference: view.reference,
      jobReference: job?.reference ?? '',
      lineCount: view.lines.length,
    });

    if (result.emailed) {
      const updated = await this.tenants.runInTenant(tenantId, async (tx) => {
        await tx.materialRequest.update({ where: { id }, data: { status: 'ordered' } });
        return this.viewFrom(tx, id);
      });
      return { request: updated, result };
    }
    return { request: view, result };
  }

  private async viewFrom(tx: TenantClient, id: string): Promise<MaterialRequestView> {
    const req = await tx.materialRequest.findFirst({ where: { id } });
    if (!req) throw new NotFoundException('Material request not found');
    const lines = await tx.materialRequestLine.findMany({
      where: { materialRequestId: id },
      orderBy: { sortOrder: 'asc' },
    });
    return {
      id: req.id,
      workItemId: req.workItemId,
      reference: req.reference,
      status: req.status as MaterialRequestStatus,
      requestedByUserId: req.requestedByUserId,
      decidedByUserId: req.decidedByUserId,
      decisionNote: req.decisionNote,
      notes: req.notes,
      lines: lines.map((l) => ({
        id: l.id,
        description: l.description,
        quantity: l.quantity,
        notes: l.notes,
        sortOrder: l.sortOrder,
      })),
    };
  }
}
