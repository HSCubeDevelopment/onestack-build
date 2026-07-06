-- 0011_invoice (card #40). Invoice from a job/accepted quote; line items are the shared onestack_line_item.
-- Money on the lines (cents); totals derived. Payment is manual (mark paid). Tenant-scoped, forced RLS.

CREATE TABLE IF NOT EXISTS "onestack_invoice" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"   uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "workItemId" uuid NOT NULL REFERENCES "onestack_work_item"("id"), -- the job
  "quoteId"    uuid REFERENCES "onestack_quote"("id"),              -- source quote (optional)
  "reference"  text NOT NULL,                                       -- INV-000001
  "status"     text NOT NULL DEFAULT 'Unpaid',                      -- Unpaid | Paid | Void
  "issueDate"  timestamptz NOT NULL DEFAULT now(),
  "dueDate"    timestamptz,
  "paidAt"     timestamptz,
  "paidBy"     uuid,                                                -- who marked it paid
  "createdAt"  timestamptz NOT NULL DEFAULT now(),
  "updatedAt"  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "onestack_invoice_tenantId_reference_key" UNIQUE ("tenantId", "reference")
);
CREATE INDEX IF NOT EXISTS "onestack_invoice_tenantId_idx" ON "onestack_invoice" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_invoice_job_idx" ON "onestack_invoice" ("tenantId", "workItemId");

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_invoice" TO app_user;

ALTER TABLE "onestack_invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_invoice" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_invoice";
CREATE POLICY "tenant_isolation" ON "onestack_invoice"
  FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
