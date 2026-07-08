-- 0027_dispatch (Phase 3 — dispatch & assignment). Tracks the field/dispatch state of a job: a status
-- (pending → dispatched → en_route → on_site → completed) and a manually-set ETA, so a dispatcher can
-- route work to the right technician and see progress. GENERIC (Scheduling & Ops core). One row per job.
-- DEFERRED: GPS location tracking and customer SMS/email notifications (vendors) — not modelled here.
-- Assignment itself reuses the existing work-item assignees. Tenant-scoped, forced RLS.

CREATE TABLE IF NOT EXISTS "onestack_dispatch" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "workItemId"        uuid NOT NULL UNIQUE REFERENCES "onestack_work_item"("id") ON DELETE CASCADE,
  "status"            text NOT NULL DEFAULT 'pending',   -- pending | dispatched | en_route | on_site | completed
  "etaAt"             timestamptz,                        -- manually set (no GPS/ETA vendor in the MVP)
  "note"              text,
  "updatedByUserId"   uuid,
  "updatedAt"         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_dispatch_tenantId_idx" ON "onestack_dispatch" ("tenantId");

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_dispatch" TO app_user;

ALTER TABLE "onestack_dispatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_dispatch" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_dispatch";
CREATE POLICY "tenant_isolation" ON "onestack_dispatch" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
