-- Reverses 0046. Drops columns, so it is DESTRUCTIVE and exists for a failed deploy, not routine use.
ALTER TABLE "onestack_scope_part"
  DROP CONSTRAINT IF EXISTS "onestack_scope_part_grade_check",
  DROP CONSTRAINT IF EXISTS "onestack_scope_part_status_check",
  DROP CONSTRAINT IF EXISTS "onestack_scope_part_buy_price_check",
  DROP CONSTRAINT IF EXISTS "onestack_scope_part_received_qty_check";
DROP INDEX IF EXISTS "onestack_scope_part_status_idx";
DROP INDEX IF EXISTS "onestack_scope_part_expected_idx";
ALTER TABLE "onestack_scope_part"
  DROP COLUMN IF EXISTS "buyPriceCents",
  DROP COLUMN IF EXISTS "grade",
  DROP COLUMN IF EXISTS "procurementStatus",
  DROP COLUMN IF EXISTS "supplierContactId",
  DROP COLUMN IF EXISTS "supplierPartNumber",
  DROP COLUMN IF EXISTS "expectedAt",
  DROP COLUMN IF EXISTS "receivedAt",
  DROP COLUMN IF EXISTS "receivedQuantity";
