-- Card 62.1 — parts procurement depth.
--
-- A parts line was only ever "description, quantity, sell price". That makes parts margin INVISIBLE,
-- and parts margin is where a panel shop actually makes money — the card says so in as many words.
-- It also had nowhere to record who it was ordered from, whether it is OEM or aftermarket, or whether
-- it has physically turned up.
--
-- ADDITIVE ONLY. Every column is nullable or defaulted, so existing rows stay valid and nothing needs
-- backfilling: a part with no buy price simply has unknown margin, which is honest — it is exactly the
-- state those rows are in today.
--
-- No new RLS policy: onestack_scope_part already has forced RLS + tenant_isolation from 0020, and
-- adding columns to a protected table does not change who can read it.

ALTER TABLE "onestack_scope_part"
  -- What the shop PAYS. Nullable, not zero-defaulted: 0 would mean "free", and an unpriced part would
  -- silently report 100% margin, which is worse than admitting we do not know.
  ADD COLUMN IF NOT EXISTS "buyPriceCents" integer,
  -- OEM / aftermarket / used / reconditioned. Free text with a CHECK rather than an enum type so a
  -- pack can extend it without a type migration.
  ADD COLUMN IF NOT EXISTS "grade" text,
  -- Procurement state, distinct from the PO's own status: a PO can be sent while one line is still
  -- back-ordered and another has landed.
  ADD COLUMN IF NOT EXISTS "procurementStatus" text NOT NULL DEFAULT 'needed',
  ADD COLUMN IF NOT EXISTS "supplierContactId" uuid,
  ADD COLUMN IF NOT EXISTS "supplierPartNumber" text,
  -- Promised arrival. The single most-asked question on a workshop floor.
  ADD COLUMN IF NOT EXISTS "expectedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "receivedAt" timestamptz,
  -- Partial deliveries are normal (2 of 3 guards arrive). Counted, not a boolean.
  ADD COLUMN IF NOT EXISTS "receivedQuantity" integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'onestack_scope_part_grade_check') THEN
    ALTER TABLE "onestack_scope_part"
      ADD CONSTRAINT "onestack_scope_part_grade_check"
      CHECK ("grade" IS NULL OR "grade" IN ('oem', 'aftermarket', 'used', 'reconditioned'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'onestack_scope_part_status_check') THEN
    ALTER TABLE "onestack_scope_part"
      ADD CONSTRAINT "onestack_scope_part_status_check"
      CHECK ("procurementStatus" IN ('needed', 'ordered', 'back_order', 'received', 'cancelled'));
  END IF;

  -- Money is never negative here. A credit is a separate movement, not a negative buy price.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'onestack_scope_part_buy_price_check') THEN
    ALTER TABLE "onestack_scope_part"
      ADD CONSTRAINT "onestack_scope_part_buy_price_check"
      CHECK ("buyPriceCents" IS NULL OR "buyPriceCents" >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'onestack_scope_part_received_qty_check') THEN
    ALTER TABLE "onestack_scope_part"
      ADD CONSTRAINT "onestack_scope_part_received_qty_check"
      CHECK ("receivedQuantity" >= 0);
  END IF;
END $$;

-- The two questions a workshop asks all day: "what's outstanding?" and "what's late?"
CREATE INDEX IF NOT EXISTS "onestack_scope_part_status_idx"
  ON "onestack_scope_part" ("tenantId", "procurementStatus");
CREATE INDEX IF NOT EXISTS "onestack_scope_part_expected_idx"
  ON "onestack_scope_part" ("tenantId", "expectedAt");
