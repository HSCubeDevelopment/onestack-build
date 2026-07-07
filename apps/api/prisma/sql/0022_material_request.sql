-- 0022_material_request (Phase 2 — floor ordering). A shop-floor material request: a technician asks for
-- the materials/parts a job needs; a manager (OWNER) approves or rejects; an approved request can then be
-- ordered — emailed to a supplier. Emailing is a separate, vendor-gated step behind a provider interface,
-- so ordering never contacts anyone until a provider is wired. GENERIC (Sales & Money core). A request is
-- just a list of items by description + quantity (no pricing — that's the PO's job). Tenant-scoped, forced RLS.

CREATE TABLE IF NOT EXISTS "onestack_material_request" (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "workItemId"         uuid NOT NULL REFERENCES "onestack_work_item"("id"),
  "reference"          text NOT NULL,
  "status"             text NOT NULL DEFAULT 'requested',  -- 'requested' | 'approved' | 'rejected' | 'ordered'
  "requestedByUserId"  uuid NOT NULL,
  "decidedByUserId"    uuid,
  "decisionNote"       text,
  "notes"              text,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedAt"          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "onestack_material_request_ref_uq" ON "onestack_material_request" ("tenantId", "reference");
CREATE INDEX IF NOT EXISTS "onestack_material_request_tenantId_idx" ON "onestack_material_request" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_material_request_job_idx" ON "onestack_material_request" ("tenantId", "workItemId");

CREATE TABLE IF NOT EXISTS "onestack_material_request_line" (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "materialRequestId"  uuid NOT NULL REFERENCES "onestack_material_request"("id") ON DELETE CASCADE,
  "description"        text NOT NULL,
  "quantity"           integer NOT NULL DEFAULT 1,
  "notes"              text,
  "sortOrder"          integer NOT NULL DEFAULT 0,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedAt"          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_material_request_line_tenantId_idx" ON "onestack_material_request_line" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_material_request_line_req_idx" ON "onestack_material_request_line" ("tenantId", "materialRequestId");

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_material_request" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_material_request_line" TO app_user;

ALTER TABLE "onestack_material_request" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_material_request" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_material_request";
CREATE POLICY "tenant_isolation" ON "onestack_material_request" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "onestack_material_request_line" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_material_request_line" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_material_request_line";
CREATE POLICY "tenant_isolation" ON "onestack_material_request_line" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
