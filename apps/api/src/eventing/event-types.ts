import { TenantClient } from '../tenancy/tenant.service';

/** An event as delivered to a consumer. `id` is stable and is the idempotency key. */
export interface DeliveredEvent {
  id: string;
  tenantId: string;
  type: string;
  payload: Record<string, unknown>;
}

/**
 * A durable, idempotent event consumer. `name` must be stable — it keys the idempotency inbox, so a
 * duplicate delivery of the same event to the same consumer is a no-op. The handler receives the
 * tenant-scoped transaction; any DB work it does is inside the caller's tenant context (RLS-enforced).
 */
export interface EventConsumer {
  name: string;
  type: string;
  handle: (tx: TenantClient, event: DeliveredEvent) => Promise<void>;
}
