-- Reverses 0047. Drops columns, so DESTRUCTIVE — for a failed deploy, not routine use.
ALTER TABLE "onestack_time_entry"
  DROP CONSTRAINT IF EXISTS "onestack_time_entry_geofence_check",
  DROP CONSTRAINT IF EXISTS "onestack_time_entry_distance_check",
  DROP CONSTRAINT IF EXISTS "onestack_time_entry_override_reason_check";
DROP INDEX IF EXISTS "onestack_time_entry_override_idx";
ALTER TABLE "onestack_time_entry"
  DROP COLUMN IF EXISTS "geofenceVerdict",
  DROP COLUMN IF EXISTS "geofenceDistanceMetres",
  DROP COLUMN IF EXISTS "geofenceOverridden",
  DROP COLUMN IF EXISTS "geofenceOverrideReason";
