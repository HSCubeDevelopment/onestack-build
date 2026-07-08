-- 0033_brand (Phase 3 — card #151, Branded booking pages). A reusable per-tenant brand profile — business
-- name, logo, colour, contact details — that customer-facing surfaces render under. GENERIC core
-- (Customer-facing / White-label). Card #151 uses it to brand the public booking page; the portal and
-- other public pages can reuse the same profile. One row per tenant. Online PAYMENTS ("and pay") are
-- deferred to the payments phase. Tenant-scoped, forced RLS.

CREATE TABLE IF NOT EXISTS "onestack_brand" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"     uuid NOT NULL UNIQUE REFERENCES "onestack_tenant"("id"),
  "businessName" text NOT NULL,
  "tagline"      text,
  "logoUrl"      text,
  "primaryColor" text,
  "contactPhone" text,
  "contactEmail" text,
  "websiteUrl"   text,
  "addressText"  text,
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  "updatedAt"    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_brand_tenantId_idx" ON "onestack_brand" ("tenantId");

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_brand" TO app_user;

ALTER TABLE "onestack_brand" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_brand" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_brand";
CREATE POLICY "tenant_isolation" ON "onestack_brand" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
