import { BadRequestException, Injectable } from '@nestjs/common';
import { PackRegistry } from '../core/pack-registry';
import { InvoiceService } from '../invoices/invoice.service';
import { BookingService } from '../scheduling/booking.service';
import { ResourceService } from '../scheduling/resource.service';
import { WorkItemService } from '../work-items/work-item.service';
import {
  bookedMinutes,
  daysInPeriod,
  turnaround,
  TurnaroundInput,
  TurnaroundStats,
  utilisation,
  UtilisationStats,
} from './reporting';

const DEFAULT_PERIOD_DAYS = 30;
const ASSUMED_HOURS_PER_DAY = 8;

export interface ReportOverview {
  from: string;
  to: string;
  revenue: {
    /** Money received since `from` (period-to-date). Consumes the invoice/payment read model unchanged. */
    receivedCents: number;
    outstandingCents: number;
  };
  jobs: {
    total: number;
    active: number;
    createdInPeriod: number;
    byState: Record<string, number>;
  };
  turnaround: TurnaroundStats;
  utilisation: UtilisationStats;
}

/**
 * Reporting & dashboards (Phase 3, card #145). GENERIC core, READ-ONLY: revenue, jobs, turnaround and
 * utilisation over a period. Composes existing services (work items, invoices, scheduling) + the pack
 * registry (final states) — it owns no tables, stores nothing, and never modifies the money engine (it
 * only reads its aggregates). Tenant isolation comes from the underlying services.
 */
@Injectable()
export class ReportingService {
  constructor(
    private readonly workItems: WorkItemService,
    private readonly invoices: InvoiceService,
    private readonly bookings: BookingService,
    private readonly resources: ResourceService,
    private readonly registry: PackRegistry,
  ) {}

  now: () => Date = () => new Date();

  async overview(tenantId: string, fromIso?: string, jobType = 'job'): Promise<ReportOverview> {
    const to = this.now();
    const from = fromIso ? new Date(fromIso) : new Date(to.getTime() - DEFAULT_PERIOD_DAYS * 86_400_000);
    if (Number.isNaN(from.getTime())) throw new BadRequestException('from must be an ISO date');
    if (from.getTime() > to.getTime()) throw new BadRequestException('from must not be in the future');

    const [jobs, receivedCents, outstandingCents, bookingList, resourceList] = await Promise.all([
      this.workItems.list(tenantId, jobType),
      this.invoices.revenueSince(tenantId, from),
      this.invoices.outstandingCents(tenantId),
      this.bookings.list(tenantId, from.toISOString(), to.toISOString()),
      this.resources.list(tenantId),
    ]);

    const finalStates = this.registry.hasWorkItemType(jobType)
      ? new Set(
          Object.entries(this.registry.getWorkItemType(jobType).workflow.states)
            .filter(([, def]) => def.final)
            .map(([state]) => state),
        )
      : new Set<string>();

    const byState: Record<string, number> = {};
    let active = 0;
    let createdInPeriod = 0;
    const turnaroundInputs: TurnaroundInput[] = [];
    for (const wi of jobs) {
      byState[wi.stateName] = (byState[wi.stateName] ?? 0) + 1;
      if (wi.createdAt.getTime() >= from.getTime()) createdInPeriod++;
      if (finalStates.has(wi.stateName)) {
        // Approx: a job now in a final state was completed at its last update.
        turnaroundInputs.push({ createdAt: wi.createdAt, completedAt: wi.updatedAt });
      } else {
        active++;
      }
    }

    const periodDays = daysInPeriod(from, to);
    const util = utilisation({
      bookedMinutes: bookedMinutes(bookingList, from, to),
      resourceCount: resourceList.length,
      periodDays,
      hoursPerDay: ASSUMED_HOURS_PER_DAY,
    });

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      revenue: { receivedCents, outstandingCents },
      jobs: { total: jobs.length, active, createdInPeriod, byState },
      turnaround: turnaround(turnaroundInputs),
      utilisation: util,
    };
  }
}
