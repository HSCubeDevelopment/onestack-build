-- 0043_time_clock. Staff time clock — check-in / check-out attendance. GENERIC core (Scheduling & Ops).
-- Each row is one attendance session for a user: clockInAt is set on check-in; clockOutAt is NULL while
-- the user is still on the clock and set on check-out. Admin (OWNER) reads totals across staff.
-- Tenant-scoped, forced RLS.

CREATE TABLE IF NOT EXISTS "onestack_time_entry" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"   uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "userId"     uuid NOT NULL,
  "clockInAt"  timestamptz NOT NULL DEFAULT now(),
  "clockOutAt" timestamptz,
  "createdAt"  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_time_entry_tenantId_idx" ON "onestack_time_entry" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_time_entry_user_idx" ON "onestack_time_entry" ("tenantId", "userId", "clockInAt");
-- At most one open (not yet clocked-out) session per user per tenant.
CREATE UNIQUE INDEX IF NOT EXISTS "onestack_time_entry_one_open_idx"
  ON "onestack_time_entry" ("tenantId", "userId") WHERE "clockOutAt" IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_time_entry" TO app_user;

ALTER TABLE "onestack_time_entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_time_entry" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_time_entry";
CREATE POLICY "tenant_isolation" ON "onestack_time_entry" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
