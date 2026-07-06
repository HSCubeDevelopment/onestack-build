-- 0004_platform_core (cards #6.3 Work Item, #6.4 Subject, #6.5 Workflow). All tenant-scoped, forced RLS.
-- No vertical nouns: type/state/fields are generic; verticals supply them via pack config.

-- ---- Work Item: the generic central unit of work ----
CREATE TABLE IF NOT EXISTS "onestack_work_item" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "type"            text NOT NULL,               -- pack-defined (e.g. "job", "appointment")
  "stateName"       text NOT NULL,               -- current workflow state (changed only via the engine)
  "workflowVersion" integer NOT NULL,            -- pinned: the workflow version this item started on
  "reference"       text NOT NULL,               -- human-readable, unique per tenant (e.g. WI-000001)
  "assignees"       jsonb NOT NULL DEFAULT '[]', -- array of user ids
  "fields"          jsonb NOT NULL DEFAULT '{}', -- pack/custom fields, validated against the type schema
  "bookingIds"      jsonb NOT NULL DEFAULT '[]', -- optional booking links (Bookings entity lands later)
  "version"         integer NOT NULL DEFAULT 1,  -- optimistic-lock counter
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "deletedAt"       timestamptz,
  CONSTRAINT "onestack_work_item_tenantId_reference_key" UNIQUE ("tenantId", "reference")
);
CREATE INDEX IF NOT EXISTS "onestack_work_item_tenantId_idx" ON "onestack_work_item" ("tenantId");

-- ---- Per-tenant reference sequence (WI-000001, incremented atomically inside the create txn) ----
CREATE TABLE IF NOT EXISTS "onestack_work_item_counter" (
  "tenantId" uuid PRIMARY KEY REFERENCES "onestack_tenant"("id"),
  "value"    integer NOT NULL DEFAULT 0
);

-- ---- Subject: optional, pack-typed "thing the work is about" ----
CREATE TABLE IF NOT EXISTS "onestack_subject" (
  "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"  uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "type"      text NOT NULL,               -- pack-defined (e.g. "vehicle", "property")
  "label"     text NOT NULL,
  "fields"    jsonb NOT NULL DEFAULT '{}', -- validated against the pack's subject-type schema
  "contactId" uuid REFERENCES "onestack_contact"("id"),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "deletedAt" timestamptz
);
CREATE INDEX IF NOT EXISTS "onestack_subject_tenantId_idx" ON "onestack_subject" ("tenantId");

-- ---- Work Item <-> Subject link (0-many both ways) ----
CREATE TABLE IF NOT EXISTS "onestack_work_item_subject" (
  "tenantId"   uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "workItemId" uuid NOT NULL REFERENCES "onestack_work_item"("id"),
  "subjectId"  uuid NOT NULL REFERENCES "onestack_subject"("id"),
  PRIMARY KEY ("workItemId", "subjectId")
);
CREATE INDEX IF NOT EXISTS "onestack_work_item_subject_tenantId_idx" ON "onestack_work_item_subject" ("tenantId");

-- ---- Grants + forced RLS on every new tenant table ----
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "onestack_work_item", "onestack_work_item_counter", "onestack_subject", "onestack_work_item_subject"
  TO app_user;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'onestack_work_item', 'onestack_work_item_counter', 'onestack_subject', 'onestack_work_item_subject'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING ("tenantId" = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid) WITH CHECK ("tenantId" = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid)',
      'tenant_isolation', t
    );
  END LOOP;
END $$;
