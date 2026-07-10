-- 0036_inventory (Phase 4 — card #220, Inventory & stock). Track stock levels, usage and reordering for
-- product-based businesses. GENERIC core (Sales & Money). An item holds the on-hand quantity + reorder
-- level; a movement is an append-only change (receive / use / adjust) that also updates the item. Both
-- tenant-scoped, forced RLS.

CREATE TABLE IF NOT EXISTS "onestack_inventory_item" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"       uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "name"           text NOT NULL,
  "sku"            text,
  "unit"           text,
  "quantityOnHand" integer NOT NULL DEFAULT 0,
  "reorderLevel"   integer NOT NULL DEFAULT 0,
  "unitCostCents"  integer,
  "active"         boolean NOT NULL DEFAULT true,
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  "updatedAt"      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_inventory_item_tenantId_idx" ON "onestack_inventory_item" ("tenantId");

CREATE TABLE IF NOT EXISTS "onestack_stock_movement" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"       uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "itemId"         uuid NOT NULL REFERENCES "onestack_inventory_item"("id") ON DELETE CASCADE,
  "delta"          integer NOT NULL,
  "reason"         text NOT NULL DEFAULT 'adjust', -- 'receive' | 'use' | 'adjust'
  "note"           text,
  "createdByUserId" uuid,
  "createdAt"      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_stock_movement_tenantId_idx" ON "onestack_stock_movement" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_stock_movement_item_idx" ON "onestack_stock_movement" ("tenantId", "itemId");

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_inventory_item" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_stock_movement" TO app_user;

ALTER TABLE "onestack_inventory_item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_inventory_item" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_inventory_item";
CREATE POLICY "tenant_isolation" ON "onestack_inventory_item" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "onestack_stock_movement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_stock_movement" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_stock_movement";
CREATE POLICY "tenant_isolation" ON "onestack_stock_movement" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
