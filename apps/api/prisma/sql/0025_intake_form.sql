-- 0025_intake_form (Phase 3 — digital intake & forms). Custom forms a shop defines, filled in against a
-- customer, whose answers land on the customer record as a submission. GENERIC (Customer & CRM core) — a
-- form is a list of question fields; a submission is the answers linked to a contact. Its own field defs
-- + validation, independent of the custom-field system, so a form can collect any subset without the
-- record's other required fields getting in the way. Tenant-scoped, forced RLS on both.

CREATE TABLE IF NOT EXISTS "onestack_intake_form" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"   uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "name"       text NOT NULL,
  "fields"     jsonb NOT NULL DEFAULT '[]',   -- [{ key, label, type, required, options? }]
  "active"     boolean NOT NULL DEFAULT true,
  "createdAt"  timestamptz NOT NULL DEFAULT now(),
  "updatedAt"  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_intake_form_tenantId_idx" ON "onestack_intake_form" ("tenantId");

CREATE TABLE IF NOT EXISTS "onestack_intake_submission" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "intakeFormId"      uuid NOT NULL REFERENCES "onestack_intake_form"("id") ON DELETE CASCADE,
  "contactId"         uuid NOT NULL REFERENCES "onestack_contact"("id") ON DELETE CASCADE,
  "answers"           jsonb NOT NULL DEFAULT '{}',
  "submittedByUserId" uuid,
  "submittedAt"       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_intake_submission_tenantId_idx" ON "onestack_intake_submission" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_intake_submission_contact_idx" ON "onestack_intake_submission" ("tenantId", "contactId");

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_intake_form" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_intake_submission" TO app_user;

ALTER TABLE "onestack_intake_form" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_intake_form" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_intake_form";
CREATE POLICY "tenant_isolation" ON "onestack_intake_form" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "onestack_intake_submission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_intake_submission" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_intake_submission";
CREATE POLICY "tenant_isolation" ON "onestack_intake_submission" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
