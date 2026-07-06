import { Injectable, Logger } from '@nestjs/common';
import { BackgroundJobRunner } from '../jobs/job-runner';
import { ConsumerRegistry } from './consumer-registry';
import { OutboxRow, OutboxService } from './outbox.service';

export interface RelayResult {
  published: number;
  retried: number;
  dead: number;
}

/**
 * The relay that turns outbox rows into consumer calls (cards #9 / #9.15). One `pollOnce` in production
 * is driven by an interval/queue worker; here it is a plain method so it is deterministically testable.
 *
 * For each due event it runs all matching consumers INSIDE the event's tenant context (via the
 * background-job wrapper → RLS), idempotently (skipping any consumer already recorded in the inbox), then
 * marks the event published. A consumer error backs the event off for retry, or dead-letters it after the
 * cap (with an alert). "Commit-then-publish" can't lose events (they're in the outbox); duplicate
 * delivery is a no-op (the inbox).
 */
@Injectable()
export class OutboxRelay {
  private readonly logger = new Logger(OutboxRelay.name);

  constructor(
    private readonly outbox: OutboxService,
    private readonly registry: ConsumerRegistry,
    private readonly jobs: BackgroundJobRunner,
  ) {}

  async pollOnce(limit = 50, clock: () => Date = () => new Date()): Promise<RelayResult> {
    const now = clock();
    const due = await this.outbox.fetchDue(limit, now);
    const result: RelayResult = { published: 0, retried: 0, dead: 0 };

    for (const ev of due) {
      try {
        await this.deliver(ev);
        await this.outbox.markPublished(ev.id, clock());
        result.published++;
      } catch (err) {
        const outcome = await this.outbox.markFailure(ev.id, ev.attempts, String(err), clock());
        if (outcome === 'dead') {
          result.dead++;
          // Alert hook: a dead-letter needs a human. Wire to the alerting channel when ops lands.
          this.logger.error(
            `Dead-lettered event ${ev.id} (${ev.type}) for tenant ${ev.tenantId}: ${err}`,
          );
        } else {
          result.retried++;
        }
      }
    }
    return result;
  }

  private async deliver(ev: OutboxRow): Promise<void> {
    const consumers = this.registry.for(ev.type);
    if (consumers.length === 0) return; // nothing subscribed → publishing it is enough

    await this.jobs.run({ tenantId: ev.tenantId }, async (tx) => {
      for (const c of consumers) {
        const already = await tx.inboxConsumed.findUnique({
          where: { consumerName_eventId: { consumerName: c.name, eventId: ev.id } },
        });
        if (already) continue; // idempotent: this consumer already handled this event
        await c.handle(tx, {
          id: ev.id,
          tenantId: ev.tenantId,
          type: ev.type,
          payload: (ev.payload ?? {}) as Record<string, unknown>,
        });
        await tx.inboxConsumed.create({
          data: { tenantId: ev.tenantId, consumerName: c.name, eventId: ev.id },
        });
      }
    });
  }
}
