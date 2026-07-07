-- 0023_supplier_invoice (Phase 2 — supplier invoice capture → bookkeeping). Capture a supplier's invoice
-- against a job as an EDITABLE DRAFT a human confirms. Two vendor steps are deferred and stubbed behind
-- provider interfaces, so nothing external happens until they're wired: OCR pre-fills the draft from a
-- scanned invoice, and an accounting sync (Xero/MYOB) pushes a confirmed invoice out. GENERIC (Sales &
-- Money core). Its own line table — a supplier invoice is what we OWE a supplier, not a customer money
-- document, so it never touches the customer money engine. Tenant-scoped, forced RLS.

CREATE TABLE IF NOT EXISTS "onestack_supplier_invoice" (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "workItemId"         uuid NOT NULL REFERENCES "onestack_work_item"("id"),
  "supplierContactId"  uuid REFERENCES "onestack_contact"("id"),   -- soft ref; the human sets/confirms it
  "invoiceNumber"      text NOT NULL,                              -- the SUPPLIER's invoice number
  "invoiceDate"        text,                                       -- as printed on the invoice (ISO-ish)
  "status"             text NOT NULL DEFAULT 'draft',              -- 'draft' | 'confirmed' | 'exported'
  "source"             text NOT NULL DEFAULT 'manual',             -- 'manual' | 'ocr'
  "notes"              text,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedAt"          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_supplier_invoice_tenantId_idx" ON "onestack_supplier_invoice" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_supplier_invoice_job_idx" ON "onestack_supplier_invoice" ("tenantId", "workItemId");

CREATE TABLE IF NOT EXISTS "onestack_supplier_invoice_line" (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "supplierInvoiceId"  uuid NOT NULL REFERENCES "onestack_supplier_invoice"("id") ON DELETE CASCADE,
  "description"        text NOT NULL,
  "quantity"           integer NOT NULL DEFAULT 1,
  "unitPriceCents"     integer NOT NULL DEFAULT 0,     -- what we owe per unit; editable draft
  "sortOrder"          integer NOT NULL DEFAULT 0,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedAt"          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_supplier_invoice_line_tenantId_idx" ON "onestack_supplier_invoice_line" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_supplier_invoice_line_inv_idx" ON "onestack_supplier_invoice_line" ("tenantId", "supplierInvoiceId");

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_supplier_invoice" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_supplier_invoice_line" TO app_user;

ALTER TABLE "onestack_supplier_invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_supplier_invoice" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_supplier_invoice";
CREATE POLICY "tenant_isolation" ON "onestack_supplier_invoice" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "onestack_supplier_invoice_line" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_supplier_invoice_line" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_supplier_invoice_line";
CREATE POLICY "tenant_isolation" ON "onestack_supplier_invoice_line" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
