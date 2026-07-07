-- 0019_ai_damage_scope (Phase 2 flagship, slice A — AI photo-to-quote). Stores the AI's proposed
-- damage scope for a job as an EDITABLE DRAFT a human confirms — nothing is auto-sent or auto-ordered.
-- The scope is a list of panels + operations (replace | repair | paint); "replace" items later become
-- priced part lines (slice B). GENERIC storage — the automotive meaning lives in the pack, not here.
-- `model` records which analyzer produced it (audit); `source` is 'ai' or 'manual'. Tenant-scoped, forced RLS.

CREATE TABLE IF NOT EXISTS "onestack_damage_scope" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"    uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "workItemId"  uuid NOT NULL REFERENCES "onestack_work_item"("id"),
  "status"      text NOT NULL DEFAULT 'draft',   -- 'draft' | 'applied'
  "source"      text NOT NULL DEFAULT 'ai',      -- 'ai' | 'manual'
  "model"       text NOT NULL,                   -- which analyzer produced it (audit)
  "summary"     text NOT NULL DEFAULT '',
  "items"       jsonb NOT NULL DEFAULT '[]',     -- [{ id, panel, operation, note?, confidence? }]
  "photoCount"  integer NOT NULL DEFAULT 0,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_damage_scope_tenantId_idx" ON "onestack_damage_scope" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_damage_scope_job_idx" ON "onestack_damage_scope" ("tenantId", "workItemId");

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_damage_scope" TO app_user;

ALTER TABLE "onestack_damage_scope" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_damage_scope" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_damage_scope";
CREATE POLICY "tenant_isolation" ON "onestack_damage_scope" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
