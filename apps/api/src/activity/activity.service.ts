import { Injectable } from '@nestjs/common';
import { FleetService } from '../fleet/fleet.service';
import { TicketsService } from '../tickets/tickets.service';
import { WorkItemService } from '../work-items/work-item.service';

/**
 * A cross-car activity directory (employee "Car history" feed). Merges what's happening across the whole
 * yard — courtesy-car movements (in / out), infringement tickets, and jobs — into one newest-first stream,
 * so staff see everything at a glance instead of only being able to search one rego at a time.
 *
 * Assembled purely from other modules' PUBLIC services (FleetService / TicketsService / WorkItemService) —
 * never their tables — like the AI module composes the photo-to-quote pipeline. Read-only; tenant-scoped
 * by each service it calls.
 */

export type ActivityKind = 'in' | 'out' | 'ticket' | 'job';

export interface ActivityEvent {
  at: string; // ISO timestamp the event sorts by
  kind: ActivityKind;
  rego: string; // '' when the event has no vehicle (e.g. a job with no linked car)
  title: string;
  subtitle: string;
  ref: string; // job reference / ticket id / movement id — for linking
}

@Injectable()
export class ActivityService {
  constructor(
    private readonly fleet: FleetService,
    private readonly tickets: TicketsService,
    private readonly workItems: WorkItemService,
  ) {}

  /** The merged, newest-first feed. `limit` bounds both each source and the final list. */
  async feed(tenantId: string, limit = 40): Promise<ActivityEvent[]> {
    const [movements, tickets, jobs] = await Promise.all([
      this.fleet.listMovements(tenantId, { limit }),
      this.tickets.list(tenantId, {}),
      this.workItems.list(tenantId, 'job'),
    ]);

    const events: ActivityEvent[] = [];

    for (const m of movements) {
      const at = m.movedAt ?? m.createdAt;
      const who = [m.driverName, m.purpose].filter(Boolean).join(' · ');
      if (m.carsInRego) {
        events.push({
          at,
          kind: 'in',
          rego: m.carsInRegoRaw || m.carsInRego,
          title: 'Car in',
          subtitle: who,
          ref: m.id,
        });
      }
      if (m.carsOutRego) {
        events.push({
          at,
          kind: 'out',
          rego: m.carsOutRegoRaw || m.carsOutRego,
          title: 'Courtesy car out',
          subtitle: who,
          ref: m.id,
        });
      }
    }

    for (const t of tickets.slice(0, limit)) {
      const amount = t.amountDueCents ? ` · $${(t.amountDueCents / 100).toFixed(2)}` : '';
      events.push({
        at: t.createdAt,
        kind: 'ticket',
        rego: t.regoRaw || t.rego,
        title: t.noticeType || 'Ticket',
        subtitle: `${[t.agency, t.offence].filter(Boolean).join(' — ')}${amount}`.trim(),
        ref: t.id,
      });
    }

    for (const j of jobs.slice(0, limit)) {
      events.push({
        at: j.createdAt.toISOString(),
        kind: 'job',
        rego: '',
        title: `Job ${j.reference}`,
        subtitle: j.stateName,
        ref: j.id, // the job id — the Car-history feed links this to the job-detail page
      });
    }

    events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)); // newest first
    return events.slice(0, limit);
  }
}
