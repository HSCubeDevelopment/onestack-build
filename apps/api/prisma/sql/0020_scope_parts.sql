-- 0020_scope_parts (Phase 2 flagship, slice B — parts list from AI scope). The editable parts list that
-- sits BETWEEN the AI damage scope and a priced quote. Each "replace" panel in the scope becomes a part
-- line here, priced from the price book (0019 scope → 0017 price book) or left at 0 for the estimator to
-- fill in. This is a DRAFT working list — a 0 price is allowed here; the money quote (which forbids <$1
-- lines) is only built from a fully-priced list, through the shared Quote engine. Nothing is ordered.
-- GENERIC storage (Sales & Money core). Tenant-scoped, forced RLS.

CREATE TABLE IF NOT EXISTS "onestack_scope_part" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"         uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "workItemId"       uuid NOT NULL REFERENCES "onestack_work_item"("id"),
  "damageScopeId"    uuid REFERENCES "onestack_damage_scope"("id"),  -- provenance; null if added by hand
  "description"      text NOT NULL,
  "quantity"         integer NOT NULL DEFAULT 1,
  "unitPriceCents"   integer NOT NULL DEFAULT 0,      -- 0 = not yet priced (draft only; never reaches a quote)
  "priceBookItemId"  uuid,                            -- soft ref to the matched price-book item, if any
  "source"           text NOT NULL DEFAULT 'ai',      -- 'ai' | 'manual'
  "sortOrder"        integer NOT NULL DEFAULT 0,
  "createdAt"        timestamptz NOT NULL DEFAULT now(),
  "updatedAt"        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_scope_part_tenantId_idx" ON "onestack_scope_part" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_scope_part_job_idx" ON "onestack_scope_part" ("tenantId", "workItemId");

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_scope_part" TO app_user;

ALTER TABLE "onestack_scope_part" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_scope_part" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_scope_part";
CREATE POLICY "tenant_isolation" ON "onestack_scope_part" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
