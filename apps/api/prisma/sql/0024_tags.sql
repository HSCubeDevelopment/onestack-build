-- 0024_tags (Phase 3 — segmentation & tagging). Named labels a shop defines and assigns to contacts, so
-- customers can be grouped for targeted comms and reporting. GENERIC (Customer & CRM core) — a tag is a
-- plain label on the shared Contact record, no vertical nouns. Two tables: the tag catalogue and a
-- contact↔tag join. A contact can have many tags; a tag groups many contacts (the "segment"). Deleting a
-- tag removes its assignments (cascade). Tenant-scoped, forced RLS on both.

CREATE TABLE IF NOT EXISTS "onestack_tag" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"   uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "name"       text NOT NULL,
  "color"      text,                      -- optional UI colour
  "createdAt"  timestamptz NOT NULL DEFAULT now(),
  "updatedAt"  timestamptz NOT NULL DEFAULT now()
);
-- One tag name per tenant (case-sensitive; the service trims + dedupes case-insensitively).
CREATE UNIQUE INDEX IF NOT EXISTS "onestack_tag_name_uq" ON "onestack_tag" ("tenantId", lower("name"));
CREATE INDEX IF NOT EXISTS "onestack_tag_tenantId_idx" ON "onestack_tag" ("tenantId");

CREATE TABLE IF NOT EXISTS "onestack_contact_tag" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"   uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "tagId"      uuid NOT NULL REFERENCES "onestack_tag"("id") ON DELETE CASCADE,
  "contactId"  uuid NOT NULL REFERENCES "onestack_contact"("id") ON DELETE CASCADE,
  "createdAt"  timestamptz NOT NULL DEFAULT now()
);
-- A tag is on a contact at most once.
CREATE UNIQUE INDEX IF NOT EXISTS "onestack_contact_tag_uq" ON "onestack_contact_tag" ("tenantId", "tagId", "contactId");
CREATE INDEX IF NOT EXISTS "onestack_contact_tag_tenantId_idx" ON "onestack_contact_tag" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_contact_tag_contact_idx" ON "onestack_contact_tag" ("tenantId", "contactId");
CREATE INDEX IF NOT EXISTS "onestack_contact_tag_tag_idx" ON "onestack_contact_tag" ("tenantId", "tagId");

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_tag" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_contact_tag" TO app_user;

ALTER TABLE "onestack_tag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_tag" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_tag";
CREATE POLICY "tenant_isolation" ON "onestack_tag" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "onestack_contact_tag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_contact_tag" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_contact_tag";
CREATE POLICY "tenant_isolation" ON "onestack_contact_tag" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
