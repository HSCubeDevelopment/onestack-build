-- Card 53.1 — geofenced check-in.
--
-- ⚠️ PRIVACY BY DESIGN. There is deliberately NO latitude/longitude column. The shop's legitimate
-- question is "was this person on site when they clocked on?", which a distance and a verdict answer
-- completely. Storing coordinates would build a continuous location history of employees — a real
-- liability under Australian privacy law, and something nobody asked for.
--
-- ADDITIVE ONLY: every column is nullable or defaulted, so existing entries stay valid. Entries
-- recorded before this simply have an unknown verdict, which is honest.

ALTER TABLE "onestack_time_entry"
  -- inside | outside | inaccurate | unavailable | null (recorded before geofencing existed)
  ADD COLUMN IF NOT EXISTS "geofenceVerdict" text,
  -- Metres from the workshop. A distance, never a position.
  ADD COLUMN IF NOT EXISTS "geofenceDistanceMetres" integer,
  -- True when the worker checked in despite a refusal. The owner's review queue is built from this.
  ADD COLUMN IF NOT EXISTS "geofenceOverridden" boolean NOT NULL DEFAULT false,
  -- Why they overrode. Required by the service when overriding, so the queue is never a list of
  -- unexplained exceptions.
  ADD COLUMN IF NOT EXISTS "geofenceOverrideReason" text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'onestack_time_entry_geofence_check') THEN
    ALTER TABLE "onestack_time_entry"
      ADD CONSTRAINT "onestack_time_entry_geofence_check"
      CHECK ("geofenceVerdict" IS NULL
             OR "geofenceVerdict" IN ('inside', 'outside', 'inaccurate', 'unavailable'));
  END IF;

  -- A distance is never negative, and anything past ~half the planet is a corrupt reading.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'onestack_time_entry_distance_check') THEN
    ALTER TABLE "onestack_time_entry"
      ADD CONSTRAINT "onestack_time_entry_distance_check"
      CHECK ("geofenceDistanceMetres" IS NULL
             OR ("geofenceDistanceMetres" >= 0 AND "geofenceDistanceMetres" <= 20037500));
  END IF;

  -- An override without a reason is exactly the thing this feature exists to prevent.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'onestack_time_entry_override_reason_check') THEN
    ALTER TABLE "onestack_time_entry"
      ADD CONSTRAINT "onestack_time_entry_override_reason_check"
      CHECK ("geofenceOverridden" = false OR "geofenceOverrideReason" IS NOT NULL);
  END IF;
END $$;

-- The owner's question: "which check-ins need a look?"
CREATE INDEX IF NOT EXISTS "onestack_time_entry_override_idx"
  ON "onestack_time_entry" ("tenantId", "geofenceOverridden");
