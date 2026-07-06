import { z } from 'zod';

/**
 * Every cross-module message is a domain EVENT with this envelope. Modules never import each other's
 * files — they talk via events validated against these Zod contracts (see docs/architecture.md §Modules).
 * A contract test on each boundary is the gate: if a producer drifts from the schema, CI goes red.
 */
export const DomainEventEnvelope = z.object({
  id: z.string().uuid(),
  type: z.string().min(1),
  tenantId: z.string().uuid(), // every event is tenant-scoped
  occurredAt: z.string().datetime(),
  version: z.literal(1),
  payload: z.unknown(),
});
export type DomainEventEnvelope = z.infer<typeof DomainEventEnvelope>;

/** Emitted when a core Contact is created. */
export const ContactCreatedPayload = z.object({
  contactId: z.string().uuid(),
  displayName: z.string().min(1),
});
export const ContactCreatedEvent = DomainEventEnvelope.extend({
  type: z.literal('contact.created'),
  payload: ContactCreatedPayload,
});
export type ContactCreatedEvent = z.infer<typeof ContactCreatedEvent>;
