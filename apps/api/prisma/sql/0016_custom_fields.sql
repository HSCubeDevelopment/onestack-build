-- 0016_custom_fields (card #11). Per-tenant custom field DEFINITIONS + a flexible customFields value bag
-- on customers (Contact) and vehicles (Subject). GENERIC: one schema serves every industry — a shop
-- declares its own fields (Insurer, Excess, …) and their values live in JSONB, validated on write against
-- the definitions. Kept SEPARATE from pack-validated `fields` so pack schemas don't strip custom values.
-- Tenant-scoped, forced RLS.

ALTER TABLE "onestack_contact" ADD COLUMN IF NOT EXISTS "customFields" jsonb NOT NULL DEFAULT '{}';
ALTER TABLE "onestack_subject" ADD COLUMN IF NOT EXISTS "customFields" jsonb NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS "onestack_custom_field" (
  "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"  uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "appliesTo" text NOT NULL,             -- 'customer' | 'vehicle'
  "key"       text NOT NULL,             -- stable machine key used in the JSONB bag
  "label"     text NOT NULL,
  "type"      text NOT NULL,             -- 'text' | 'number' | 'date' | 'select' | 'boolean'
  "required"  boolean NOT NULL DEFAULT false,
  "options"   jsonb NOT NULL DEFAULT '[]',  -- for 'select'
  "archived"  boolean NOT NULL DEFAULT false, -- soft delete: hides the field but keeps existing values
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tenantId", "appliesTo", "key")
);
CREATE INDEX IF NOT EXISTS "onestack_custom_field_tenantId_idx" ON "onestack_custom_field" ("tenantId");

-- Trigram indexes make the customer/vehicle search fast + typo-tolerant (ILIKE %q%).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "onestack_contact_name_trgm" ON "onestack_contact" USING gin ("displayName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "onestack_contact_phone_trgm" ON "onestack_contact" USING gin ("phone" gin_trgm_ops);

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_custom_field" TO app_user;

ALTER TABLE "onestack_custom_field" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_custom_field" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_custom_field";
CREATE POLICY "tenant_isolation" ON "onestack_custom_field" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
