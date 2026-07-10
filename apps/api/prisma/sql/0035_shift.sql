-- 0035_shift (Phase 4 — card #211, Roster & staff management). Staff shifts, availability and time-off.
-- GENERIC core (Scheduling & Ops). Each row is a scheduled block for a staff member (a shift, or time-off).
-- Tenant-scoped, forced RLS.

CREATE TABLE IF NOT EXISTS "onestack_shift" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"    uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "staffUserId" uuid,
  "staffName"   text NOT NULL,
  "kind"        text NOT NULL DEFAULT 'shift', -- 'shift' | 'time_off'
  "startsAt"    timestamptz NOT NULL,
  "endsAt"      timestamptz NOT NULL,
  "notes"       text,
  "createdAt"   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_shift_tenantId_idx" ON "onestack_shift" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_shift_range_idx" ON "onestack_shift" ("tenantId", "startsAt");

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_shift" TO app_user;

ALTER TABLE "onestack_shift" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_shift" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_shift";
CREATE POLICY "tenant_isolation" ON "onestack_shift" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
