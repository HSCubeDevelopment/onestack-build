import { Injectable } from '@nestjs/common';
import { TenantClient } from '../tenancy/tenant.service';
import { ConsumerRegistry } from './consumer-registry';
import { EventConsumer } from './event-types';
import { EnqueueInput, OutboxService } from './outbox.service';

/**
 * The event bus / integration backbone (card #9). Modules communicate via events (e.g. booking.created,
 * invoice.paid) instead of calling each other — keeping modules decoupled. Delivery is DURABLE: publishing
 * writes to the transactional outbox in the producer's transaction; the OutboxRelay delivers to consumers
 * at-least-once with idempotency. (This is the durable backbone; the in-process, feature-gated bus in
 * src/composition is a lighter, synchronous variant used for feature-flag enforcement.)
 */
@Injectable()
export class EventBus {
  constructor(
    private readonly outbox: OutboxService,
    private readonly registry: ConsumerRegistry,
  ) {}

  /** Publish transactionally: enqueue in the SAME tenant transaction as the state change. */
  publish(tx: TenantClient, event: EnqueueInput): Promise<string> {
    return this.outbox.enqueue(tx, event);
  }

  /** Register a durable, idempotent consumer. */
  subscribe(consumer: EventConsumer): void {
    this.registry.register(consumer);
  }
}
