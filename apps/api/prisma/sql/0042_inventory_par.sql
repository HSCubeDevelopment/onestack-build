-- 0042_inventory_par (Phase 4 — card #260, Automotive extensions). Adds a par (target) stock level so we can
-- suggest auto-reorder quantities to bring an item back up to par, and supports a stocktake (set the counted
-- on-hand). GENERIC inventory extension. Non-destructive ADD COLUMN. Paint-mixing system integration
-- (PPG/Axalta/BASF/Sikkens) requires a vendor and is deferred. Tenant-scoped tables already have RLS.

ALTER TABLE "onestack_inventory_item" ADD COLUMN IF NOT EXISTS "parLevel" integer NOT NULL DEFAULT 0;
