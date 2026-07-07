/**
 * The vendor boundary for emailing an approved material request to a supplier (Phase 2 — floor ordering).
 * Emailing needs a deferred provider, so the app is built right up to this seam: a `MaterialOrderSender`
 * interface plus a no-op default that emails nothing and says so. A real sender drops in behind the same
 * interface later — no call-site changes. Until then, ordering an approved request reports that nothing
 * was emailed and leaves it approved (it only advances to 'ordered' once a real send succeeds). Honours
 * the golden rule: never auto-send.
 */

export interface MaterialOrderSummary {
  reference: string;
  jobReference: string;
  lineCount: number;
}

export interface OrderSendResult {
  emailed: boolean;
  /** Why it wasn't emailed, when `emailed` is false. */
  reason?: string;
}

export interface MaterialOrderSender {
  send(order: MaterialOrderSummary): Promise<OrderSendResult>;
}

/** Default sender: emails nothing and says why. Swapped for a real email provider later. */
export class NoopMaterialOrderSender implements MaterialOrderSender {
  async send(): Promise<OrderSendResult> {
    return { emailed: false, reason: 'No email provider configured — supplier not emailed' };
  }
}

/** DI token for the configured sender. */
export const MATERIAL_ORDER_SENDER = Symbol('MATERIAL_ORDER_SENDER');
