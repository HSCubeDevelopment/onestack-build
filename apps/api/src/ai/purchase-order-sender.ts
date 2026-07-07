/**
 * The vendor boundary for emailing a purchase order to a supplier (Phase 2 flagship, slice C). Sending
 * needs a deferred email provider, so the app is built right up to this seam: a `PurchaseOrderSender`
 * interface plus a no-op default that never contacts anyone. When an email vendor is chosen, a real
 * sender is dropped in behind the same interface — no call site changes. Until then, "send" honestly
 * reports that nothing went out. This keeps the golden rule intact: never auto-send.
 */

export interface PurchaseOrderSummary {
  reference: string;
  supplierContactId: string | null;
  lineCount: number;
  totalCents: number;
}

export interface SendResult {
  delivered: boolean;
  /** Why it wasn't delivered (e.g. no provider configured), when `delivered` is false. */
  reason?: string;
}

export interface PurchaseOrderSender {
  send(po: PurchaseOrderSummary): Promise<SendResult>;
}

/** Default sender: does nothing and says so. Swapped for a real email provider later. */
export class NoopPurchaseOrderSender implements PurchaseOrderSender {
  async send(): Promise<SendResult> {
    return { delivered: false, reason: 'No email provider configured — PO not sent' };
  }
}

/** DI token for the configured sender. */
export const PURCHASE_ORDER_SENDER = Symbol('PURCHASE_ORDER_SENDER');
