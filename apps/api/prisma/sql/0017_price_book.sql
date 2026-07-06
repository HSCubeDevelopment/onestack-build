-- 0017_price_book (card #32). A reusable catalogue of the shop's common labour items & parts with
-- default prices, so quote/invoice lines can be built by picking instead of typing. GENERIC (Sales &
-- Money core). Prices are integer cents (docs/money-rules.md #29). Picking an item COPIES its values
-- onto a line — the line stays independently editable and never mutates the book. Tenant-scoped, forced RLS.

CREATE TABLE IF NOT EXISTS "onestack_price_book_item" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"            uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "name"                text NOT NULL,
  "description"         text,
  "type"                text NOT NULL,       -- 'labour' | 'part'
  "unit"                text NOT NULL,       -- 'hour' | 'each'
  "defaultUnitPriceCents" integer NOT NULL,
  "code"                text,
  "active"              boolean NOT NULL DEFAULT true,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedAt"           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_price_book_item_tenantId_idx" ON "onestack_price_book_item" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_price_book_item_active_idx" ON "onestack_price_book_item" ("tenantId", "active");
CREATE INDEX IF NOT EXISTS "onestack_price_book_name_trgm" ON "onestack_price_book_item" USING gin ("name" gin_trgm_ops);

GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_price_book_item" TO app_user;

ALTER TABLE "onestack_price_book_item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_price_book_item" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_price_book_item";
CREATE POLICY "tenant_isolation" ON "onestack_price_book_item" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
