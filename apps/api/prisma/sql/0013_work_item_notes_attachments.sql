-- 0013_work_item_notes_attachments (card #21). Notes + photo attachments on a work item. GENERIC:
-- "assignee" (a staff user), a running note log, and attached files apply to any vertical — the
-- automotive pack merely LABELS assignee → "Technician". Assignment reuses the existing
-- onestack_work_item.assignees JSON array. Files live in Supabase Storage; rows hold the metadata.
-- Tenant-scoped, forced RLS.

CREATE TABLE IF NOT EXISTS "onestack_work_item_note" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"     uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "workItemId"   uuid NOT NULL REFERENCES "onestack_work_item"("id"),
  "authorUserId" uuid NOT NULL,          -- Supabase auth user id (the staff member who wrote it)
  "body"         text NOT NULL,
  "createdAt"    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_work_item_note_tenantId_idx" ON "onestack_work_item_note" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_work_item_note_item_idx" ON "onestack_work_item_note" ("tenantId", "workItemId");

CREATE TABLE IF NOT EXISTS "onestack_work_item_attachment" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"         uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "workItemId"       uuid NOT NULL REFERENCES "onestack_work_item"("id"),
  "storageRef"       text NOT NULL,      -- tenant-prefixed path in Supabase Storage
  "fileName"         text NOT NULL,
  "contentType"      text NOT NULL,
  "sizeBytes"        integer NOT NULL,
  "caption"          text,
  "uploadedByUserId" uuid NOT NULL,
  "createdAt"        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_work_item_attachment_tenantId_idx" ON "onestack_work_item_attachment" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_work_item_attachment_item_idx" ON "onestack_work_item_attachment" ("tenantId", "workItemId");

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_work_item_note", "onestack_work_item_attachment" TO app_user;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['onestack_work_item_note', 'onestack_work_item_attachment'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING ("tenantId" = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid) WITH CHECK ("tenantId" = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid)',
      'tenant_isolation', t
    );
  END LOOP;
END $$;
