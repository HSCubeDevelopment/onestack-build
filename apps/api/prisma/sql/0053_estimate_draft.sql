-- 0053_estimate_draft (Editable saved photo-estimate). Lets an employee's instant estimate be REOPENED
-- and edited in place instead of re-run from scratch each time. One current draft per job (re-saving
-- updates the same row); the full structured estimate (scope, parts, labour, rate, materials, totals,
-- flags) lives in `data` so it round-trips into the same editor. DRAFT only — never a formal money quote,
-- so this is not a billing table. GENERIC (Sales & Money core, draft side). Tenant-scoped with forced RLS.
-- Non-destructive: one new table only.
--
-- ⚠️ REVIEW REQUIRED (CLAUDE.md §4/§7): a NEW tenant table + RLS policy (and money-adjacent). Read before
-- applying. Apply in the Supabase SQL editor on production, then deploy the API + web.

CREATE TABLE IF NOT EXISTS "onestack_estimate_draft" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "workItemId"      uuid NOT NULL REFERENCES "onestack_work_item"("id"),
  "rego"            text NOT NULL DEFAULT '',
  "summary"         text NOT NULL DEFAULT '',
  "data"            jsonb NOT NULL DEFAULT '{}'::jsonb,   -- full structured estimate (round-trips into editor)
  "photoCount"      integer NOT NULL DEFAULT 0,
  "source"          text NOT NULL DEFAULT 'ai',            -- 'ai' | 'manual'
  "model"           text NOT NULL DEFAULT '',              -- analyzer id
  "status"          text NOT NULL DEFAULT 'draft',
  "createdByUserId" uuid,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedAt"       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_estimate_draft_tenantId_idx"  ON "onestack_estimate_draft" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_estimate_draft_job_idx"       ON "onestack_estimate_draft" ("tenantId", "workItemId");

-- ---------------------------------------------------------------- grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_estimate_draft" TO app_user;

-- ---------------------------------------------------------------- forced RLS + tenant-isolation policy
ALTER TABLE "onestack_estimate_draft" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_estimate_draft" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_estimate_draft";
CREATE POLICY "tenant_isolation" ON "onestack_estimate_draft" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
