-- 0021_purchase_order (Phase 2 flagship, slice C — draft PO). A purchase order groups the parts to buy
-- from a supplier for a job, as a DRAFT a human confirms. NOTHING is sent: creating and confirming a PO
-- never contacts a supplier — emailing it is a separate, vendor-gated step behind a provider interface.
-- Seeded from the parts list (0020). Its own line table (NOT the customer money engine) — a PO is what we
-- expect to PAY a supplier, edited by the estimator. GENERIC (Sales & Money core). Tenant-scoped, forced RLS.

CREATE TABLE IF NOT EXISTS "onestack_purchase_order" (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "workItemId"         uuid NOT NULL REFERENCES "onestack_work_item"("id"),
  "supplierContactId"  uuid REFERENCES "onestack_contact"("id"),   -- soft ref; the human sets/confirms it
  "reference"          text NOT NULL,
  "status"             text NOT NULL DEFAULT 'draft',   -- 'draft' | 'confirmed' | 'sent'
  "notes"              text,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedAt"          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "onestack_purchase_order_ref_uq" ON "onestack_purchase_order" ("tenantId", "reference");
CREATE INDEX IF NOT EXISTS "onestack_purchase_order_tenantId_idx" ON "onestack_purchase_order" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_purchase_order_job_idx" ON "onestack_purchase_order" ("tenantId", "workItemId");

CREATE TABLE IF NOT EXISTS "onestack_purchase_order_line" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"         uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "purchaseOrderId"  uuid NOT NULL REFERENCES "onestack_purchase_order"("id") ON DELETE CASCADE,
  "scopePartId"      uuid,                             -- provenance; null if added by hand
  "description"      text NOT NULL,
  "quantity"         integer NOT NULL DEFAULT 1,
  "unitPriceCents"   integer NOT NULL DEFAULT 0,       -- expected cost to us; editable draft
  "sortOrder"        integer NOT NULL DEFAULT 0,
  "createdAt"        timestamptz NOT NULL DEFAULT now(),
  "updatedAt"        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_purchase_order_line_tenantId_idx" ON "onestack_purchase_order_line" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_purchase_order_line_po_idx" ON "onestack_purchase_order_line" ("tenantId", "purchaseOrderId");

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_purchase_order" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_purchase_order_line" TO app_user;

ALTER TABLE "onestack_purchase_order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_purchase_order" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_purchase_order";
CREATE POLICY "tenant_isolation" ON "onestack_purchase_order" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "onestack_purchase_order_line" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_purchase_order_line" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_purchase_order_line";
CREATE POLICY "tenant_isolation" ON "onestack_purchase_order_line" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
