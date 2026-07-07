/**
 * The two vendor boundaries for supplier invoice capture (Phase 2), both deferred and stubbed so the app
 * is built right up to the seam and nothing external happens until a provider is wired:
 *   - OCR: read a scanned supplier invoice and pre-fill a draft (needs an OCR vendor).
 *   - Accounting sync: push a confirmed invoice to Xero/MYOB (needs an accounting vendor).
 * Real providers drop in behind these interfaces later — no call-site changes.
 */

// ---- OCR (scan → suggested draft) ----

export interface OcrScanRef {
  /** An attachment already on the job (a photo/scan of the supplier invoice). */
  attachmentId: string;
}

export interface OcrSuggestion {
  invoiceNumber: string;
  invoiceDate: string | null;
  lines: { description: string; quantity: number; unitPriceCents: number }[];
}

export interface OcrScanResult {
  extracted: boolean;
  suggestion: OcrSuggestion | null;
  /** Why nothing was extracted, when `extracted` is false. */
  reason?: string;
}

export interface SupplierInvoiceOcr {
  scan(ref: OcrScanRef): Promise<OcrScanResult>;
}

/** Default OCR: extracts nothing and says why. Swapped for a real OCR vendor later. */
export class NoopSupplierInvoiceOcr implements SupplierInvoiceOcr {
  async scan(): Promise<OcrScanResult> {
    return {
      extracted: false,
      suggestion: null,
      reason: 'No OCR provider configured — enter the invoice manually',
    };
  }
}

export const SUPPLIER_INVOICE_OCR = Symbol('SUPPLIER_INVOICE_OCR');

// ---- Accounting sync (push a confirmed invoice) ----

export interface BookkeepingRef {
  invoiceNumber: string;
  supplierContactId: string | null;
  totalCents: number;
}

export interface BookkeepingResult {
  exported: boolean;
  /** The accounting system's id for the pushed bill, when exported. */
  externalId: string | null;
  /** Why it wasn't exported, when `exported` is false. */
  reason?: string;
}

export interface BookkeepingSync {
  push(ref: BookkeepingRef): Promise<BookkeepingResult>;
}

/** Default sync: pushes nothing and says why. Swapped for Xero/MYOB later. */
export class NoopBookkeepingSync implements BookkeepingSync {
  async push(): Promise<BookkeepingResult> {
    return {
      exported: false,
      externalId: null,
      reason: 'No accounting provider configured — invoice not exported',
    };
  }
}

export const BOOKKEEPING_SYNC = Symbol('BOOKKEEPING_SYNC');
