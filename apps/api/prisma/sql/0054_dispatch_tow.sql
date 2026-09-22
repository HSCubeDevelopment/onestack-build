-- 0054_dispatch_tow (Tow dispatch). The office sends a driver to collect a car: where to pick it up,
-- and which yard to drop it at. Additive columns on the existing dispatch sidecar — no new table.
--
-- WHY HERE AND NOT ON THE JOB. The natural home is onestack_work_item.fields, but that shape is the
-- Pack Contract (packs/automotive/automotive.pack.ts) and is off-limits without senior review. The
-- existing tow flow avoided it for the same reason and stuffed the pickup address into a timeline note
-- instead, where nothing can read it back. onestack_dispatch already holds the per-job field state and
-- already has the UNIQUE workItemId link, so these belong with status and ETA.
--
-- This is also the first structured link from a job to a yard: onestack_yard_drop keys on rego alone
-- and has no workItemId, so until now "which yard is this job's car going to" had no answer.
--
-- PRIVACY: pickupAddress is a TYPED HUMAN ADDRESS, entered by whoever books the tow. It is not a device
-- fix. The rule stated in 0047/0048 — that a live GPS position is never stored — is unchanged here.
ALTER TABLE "onestack_dispatch"
  ADD COLUMN IF NOT EXISTS "pickupAddress"     text,
  ADD COLUMN IF NOT EXISTS "destinationYardId" uuid REFERENCES "onestack_yard"("id"),
  ADD COLUMN IF NOT EXISTS "pickupNotes"       text;

-- Finding a driver's next pickup means "dispatch rows for jobs assigned to me, not yet completed".
CREATE INDEX IF NOT EXISTS "onestack_dispatch_yard_idx"
  ON "onestack_dispatch" ("tenantId", "destinationYardId");
