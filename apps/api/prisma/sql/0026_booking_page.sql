-- 0026_booking_page (Phase 3 — online booking). A per-tenant public self-service booking page: a shop
-- picks which resources are bookable + a default slot length, and shares an unguessable token URL. A
-- customer books a free slot 24/7, which creates a contact + a booking (reusing the scheduling module's
-- double-booking check). GENERIC (Scheduling & Ops core). DEFERRED: deposits (payments) and Google/social
-- channels (vendors) — not built here. One page per tenant. The public path resolves the token via the
-- BYPASSRLS admin connection (no tenant context yet), then writes through the tenant wrapper. Forced RLS.

CREATE TABLE IF NOT EXISTS "onestack_booking_page" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"    uuid NOT NULL UNIQUE REFERENCES "onestack_tenant"("id"),
  "publicToken" text NOT NULL UNIQUE,
  "name"        text NOT NULL DEFAULT 'Book online',
  "enabled"     boolean NOT NULL DEFAULT false,
  "slotMinutes" integer NOT NULL DEFAULT 60,
  "resourceIds" jsonb NOT NULL DEFAULT '[]',   -- which resources are publicly bookable
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_booking_page_tenantId_idx" ON "onestack_booking_page" ("tenantId");

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_booking_page" TO app_user;

ALTER TABLE "onestack_booking_page" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_booking_page" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_booking_page";
CREATE POLICY "tenant_isolation" ON "onestack_booking_page" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
