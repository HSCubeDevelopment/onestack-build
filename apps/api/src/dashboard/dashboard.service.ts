import { Injectable } from '@nestjs/common';
import { PackRegistry } from '../core/pack-registry';
import { InvoiceService } from '../invoices/invoice.service';
import { SitesService } from '../sites/sites.service';
import { WorkItemService } from '../work-items/work-item.service';
import { YardsService } from '../yards/yards.service';

/** SITE-1 — active-job count for one location, shown on the owner dashboard's "By location" row. */
export interface SiteBreakdown {
  siteId: string;
  name: string;
  code: string | null;
  activeJobs: number;
}

export interface DashboardSummary {
  jobsByState: Record<string, number>;
  activeJobs: number; // jobs not in a final workflow state
  totalUnpaidCents: number; // outstanding across all non-Void invoices
  thisWeekRevenueCents: number; // money received since the start of the week
  inYards: number; // cars currently parked in yards, awaiting a job (YRD-1)
  sites: SiteBreakdown[]; // active jobs per location (SITE-1); empty when the shop has one site
  unassignedActiveJobs: number; // active jobs not yet tagged to any site (SITE-1)
  weekStart: Date;
}

/**
 * Owner dashboard (card #52) — a thin, READ-ONLY home showing "my numbers": jobs by state (in progress,
 * ready for collection…), total unpaid, and this-week revenue. Composes existing services; owns no
 * tables. Generic — job states come from the pack workflow, money from the shared invoice/payment model.
 * Everything is tenant-scoped by the underlying services.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly workItems: WorkItemService,
    private readonly invoices: InvoiceService,
    private readonly registry: PackRegistry,
    private readonly yards: YardsService,
    private readonly sites: SitesService,
  ) {}

  async getSummary(tenantId: string, jobType = 'job'): Promise<DashboardSummary> {
    const weekStart = startOfIsoWeek(new Date());

    const [jobs, totalUnpaidCents, thisWeekRevenueCents, inYards, siteList] = await Promise.all([
      this.workItems.list(tenantId, jobType),
      this.invoices.outstandingCents(tenantId),
      this.invoices.revenueSince(tenantId, weekStart),
      this.yards.countInYards(tenantId),
      this.sites.list(tenantId),
    ]);

    const finalStates = this.registry.hasWorkItemType(jobType)
      ? new Set(
          Object.entries(this.registry.getWorkItemType(jobType).workflow.states)
            .filter(([, def]) => def.final)
            .map(([state]) => state),
        )
      : new Set<string>();

    // SITE-1: bucket ACTIVE jobs by site from the list we already have — no extra query, and the site
    // names come from SitesService (the module that owns them), so we never read onestack_site here.
    const activeBySite = new Map<string, number>();
    let unassignedActiveJobs = 0;

    const jobsByState: Record<string, number> = {};
    let activeJobs = 0;
    for (const wi of jobs) {
      jobsByState[wi.stateName] = (jobsByState[wi.stateName] ?? 0) + 1;
      if (finalStates.has(wi.stateName)) continue;
      activeJobs++;
      if (wi.siteId) activeBySite.set(wi.siteId, (activeBySite.get(wi.siteId) ?? 0) + 1);
      else unassignedActiveJobs++;
    }

    const sites: SiteBreakdown[] = siteList.map((s) => ({
      siteId: s.id,
      name: s.name,
      code: s.code,
      activeJobs: activeBySite.get(s.id) ?? 0,
    }));

    return {
      jobsByState,
      activeJobs,
      totalUnpaidCents,
      thisWeekRevenueCents,
      inYards,
      sites,
      unassignedActiveJobs,
      weekStart,
    };
  }
}

/** Monday 00:00:00.000 UTC of the week containing `now`. */
function startOfIsoWeek(now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay(); // 0=Sun … 6=Sat
  const diff = (day + 6) % 7; // days since Monday
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}
