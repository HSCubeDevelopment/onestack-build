-- 0008_document (card #6.7). Metadata row linking a stored document to its source entity. Tenant-scoped.
-- The file bytes live in Supabase Storage (private, per-tenant path); this row holds the reference.

CREATE TABLE IF NOT EXISTS "onestack_document" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "type"            text NOT NULL,          -- e.g. 'quote', 'invoice'
  "parentType"      text NOT NULL,          -- source entity type (e.g. 'work_item', 'invoice')
  "parentId"        uuid NOT NULL,
  "templateRef"     text NOT NULL,
  "templateVersion" text NOT NULL,          -- which template version produced it (deterministic)
  "storageRef"      text NOT NULL,          -- Supabase Storage path (tenant-prefixed)
  "generatedAt"     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_document_tenantId_idx" ON "onestack_document" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_document_parent_idx"
  ON "onestack_document" ("tenantId", "parentType", "parentId");

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_document" TO app_user;

ALTER TABLE "onestack_document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_document" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_document";
CREATE POLICY "tenant_isolation" ON "onestack_document"
  FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
