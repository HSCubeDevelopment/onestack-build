import { createHmac } from 'node:crypto';

/**
 * Webhook signing — pure (Phase 4, card #252). Partners verify the payload came from us (and wasn't
 * tampered) by recomputing this HMAC-SHA256 over the exact JSON body with their endpoint's secret and
 * comparing to the X-OneStack-Signature header. No vendor — plain crypto.
 */
export function signPayload(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

/** Whether an endpoint subscribed to `events` should receive `eventType` ('*' = all). */
export function subscribes(events: unknown, eventType: string): boolean {
  if (!Array.isArray(events)) return false;
  return events.includes('*') || events.includes(eventType);
}
