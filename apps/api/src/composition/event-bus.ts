import { Injectable } from '@nestjs/common';
import { FeatureFlagService } from './feature-flag.service';
import { ModuleKey } from './module-registry';

export interface DomainEvent {
  type: string;
  tenantId: string;
  payload: unknown;
}

type Handler = (event: DomainEvent) => Promise<void> | void;

/**
 * Minimal in-process event bus with FEATURE-GATED delivery (card #6.2). A consumer is registered for a
 * module; if that module is OFF for the event's tenant, the consumer does not receive the event. This is
 * the other half of server-side enforcement: a disabled module's routes are unreachable AND its event
 * consumers stay silent. (Cross-process transport — pgmq/pg-boss — comes later; the gating rule is here.)
 */
@Injectable()
export class EventBus {
  private readonly subscribers: { module: ModuleKey; type: string; handler: Handler }[] = [];

  constructor(private readonly flags: FeatureFlagService) {}

  subscribe(module: ModuleKey, type: string, handler: Handler): void {
    this.subscribers.push({ module, type, handler });
  }

  async publish(event: DomainEvent): Promise<void> {
    for (const sub of this.subscribers) {
      if (sub.type !== event.type) continue;
      if (!(await this.flags.isEnabled(event.tenantId, sub.module))) continue; // module off → ignore
      await sub.handler(event);
    }
  }
}
