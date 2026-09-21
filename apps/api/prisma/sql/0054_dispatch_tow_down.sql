-- Reverse of 0054_dispatch_tow. Drops the tow columns; the dispatch row itself and its status/ETA stay.
DROP INDEX IF EXISTS "onestack_dispatch_yard_idx";
ALTER TABLE "onestack_dispatch"
  DROP COLUMN IF EXISTS "pickupAddress",
  DROP COLUMN IF EXISTS "destinationYardId",
  DROP COLUMN IF EXISTS "pickupNotes";
