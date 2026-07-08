import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BoardService } from '../board/board.service';
import { TenantService } from '../tenancy/tenant.service';
import { WorkItemService } from '../work-items/work-item.service';
import {
  DispatchJob,
  DispatchLane,
  DispatchStatus,
  groupByTechnician,
  isDispatchStatus,
} from './dispatch';

export interface DispatchView {
  workItemId: string;
  status: DispatchStatus;
  etaAt: string | null;
  note: string | null;
  updatedByUserId: string | null;
  updatedAt: Date;
}

export interface SetDispatchInput {
  status: DispatchStatus;
  etaAt?: string | null;
  note?: string | null;
}

/**
 * Dispatch & assignment (Phase 3). Routes work to technicians and tracks each job's field/dispatch state
 * (status + a manual ETA). The dispatch board reuses the job board read-model (BoardService) and regroups
 * the same cards by technician, joining each job's dispatch status. Assignment itself reuses work-item
 * assignees. Tenant-scoped via the wrapper. DEFERRED: GPS location + customer notifications (vendor).
 */
@Injectable()
export class DispatchService {
  constructor(
    private readonly tenants: TenantService,
    private readonly boards: BoardService,
    private readonly workItems: WorkItemService,
  ) {}

  /** Set/track a job's dispatch status + optional ETA. Upserts the single dispatch row for the job. */
  async setStatus(
    tenantId: string,
    jobId: string,
    input: SetDispatchInput,
    userId: string,
  ): Promise<DispatchView> {
    if (!isDispatchStatus(input.status)) throw new BadRequestException('Invalid dispatch status');
    let etaAt: Date | null | undefined;
    if (input.etaAt !== undefined) {
      if (input.etaAt === null) etaAt = null;
      else {
        etaAt = new Date(input.etaAt);
        if (Number.isNaN(etaAt.getTime()))
          throw new BadRequestException('etaAt is not a valid date/time');
      }
    }
    await this.workItems.get(tenantId, jobId); // 404s for a missing/other-tenant job

    return this.tenants.runInTenant(tenantId, async (tx) => {
      const existing = await tx.dispatch.findFirst({ where: { workItemId: jobId } });
      const data = {
        status: input.status,
        note: input.note !== undefined ? input.note?.trim() || null : (existing?.note ?? null),
        updatedByUserId: userId,
        ...(etaAt !== undefined ? { etaAt } : {}),
      };
      const row = existing
        ? await tx.dispatch.update({ where: { workItemId: jobId }, data })
        : await tx.dispatch.create({
            data: { tenantId, workItemId: jobId, ...data, etaAt: etaAt ?? null },
          });
      return toView(row);
    });
  }

  async get(tenantId: string, jobId: string): Promise<DispatchView> {
    await this.workItems.get(tenantId, jobId);
    const row = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.dispatch.findFirst({ where: { workItemId: jobId } }),
    );
    if (!row) {
      // No dispatch set yet — report the default pending state.
      return {
        workItemId: jobId,
        status: 'pending',
        etaAt: null,
        note: null,
        updatedByUserId: null,
        updatedAt: new Date(0),
      };
    }
    return toView(row);
  }

  /** The dispatch board: the job board's cards regrouped by technician, with each job's dispatch status. */
  async board(tenantId: string): Promise<{ lanes: DispatchLane[] }> {
    const board = await this.boards.getBoard(tenantId, 'job');
    const cards = board.columns.flatMap((c) =>
      c.cards.map((card) => ({ card, stateName: c.state })),
    );
    const dispatches = await this.tenants.runInTenant(tenantId, (tx) => tx.dispatch.findMany());
    const byJob = new Map(dispatches.map((d) => [d.workItemId, d]));

    const jobs: DispatchJob[] = cards.map(({ card, stateName }) => {
      const d = byJob.get(card.id);
      return {
        id: card.id,
        reference: card.reference,
        stateName,
        customerName: card.customerName,
        vehicleLabel: card.vehicleLabel,
        assignees: card.assignees,
        dispatchStatus: (d?.status as DispatchStatus) ?? 'pending',
        etaAt: d?.etaAt ? d.etaAt.toISOString() : null,
      };
    });
    return { lanes: groupByTechnician(jobs) };
  }
}

function toView(row: {
  workItemId: string;
  status: string;
  etaAt: Date | null;
  note: string | null;
  updatedByUserId: string | null;
  updatedAt: Date;
}): DispatchView {
  return {
    workItemId: row.workItemId,
    status: row.status as DispatchStatus,
    etaAt: row.etaAt ? row.etaAt.toISOString() : null,
    note: row.note,
    updatedByUserId: row.updatedByUserId,
    updatedAt: row.updatedAt,
  };
}
