-- 0034_waitlist (Phase 4 — card #210, Waitlist & auto-fill). A list of customers waiting for a slot, so a
-- cancellation can be filled to protect utilisation. GENERIC core (Scheduling & Ops). An entry optionally
-- prefers a resource; "auto-fill" surfaces matching waiting entries for a freed slot, which the owner
-- confirms into a booking (never auto-books a customer without confirmation). Tenant-scoped, forced RLS.

CREATE TABLE IF NOT EXISTS "onestack_waitlist_entry" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"    uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "contactId"   uuid REFERENCES "onestack_contact"("id") ON DELETE SET NULL,
  "name"        text NOT NULL,
  "phone"       text NOT NULL,
  "resourceId"  uuid REFERENCES "onestack_resource"("id") ON DELETE SET NULL,
  "notes"       text,
  "status"      text NOT NULL DEFAULT 'waiting', -- 'waiting' | 'booked' | 'removed'
  "bookingId"   uuid,
  "createdAt"   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_waitlist_entry_tenantId_idx" ON "onestack_waitlist_entry" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_waitlist_entry_status_idx" ON "onestack_waitlist_entry" ("tenantId", "status");

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_waitlist_entry" TO app_user;

ALTER TABLE "onestack_waitlist_entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_waitlist_entry" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_waitlist_entry";
CREATE POLICY "tenant_isolation" ON "onestack_waitlist_entry" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
