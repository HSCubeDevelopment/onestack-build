-- 0044_fleet (Fleet & courtesy cars). A one-to-one migration of the standalone "In N Out" staff app into
-- OneStack. GENERIC core (Scheduling & Ops). Panel/repair shops lend the customer a courtesy/loan car while
-- their own car is in for repair. This domain tracks the shop's FLEET of loan cars, each MOVEMENT (the
-- customer's car comes IN, a fleet car goes OUT), each RETURN (the fleet car comes back), forward BOOKINGS of
-- a fleet car, and before/after PHOTOS. Every table is tenant-scoped with forced RLS. Customers reference the
-- shared onestack_contact; nothing here touches another module's tables.

-- ---------------------------------------------------------------- vehicles (the shop's loan fleet)
CREATE TABLE IF NOT EXISTS "onestack_fleet_vehicle" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"     uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "rego"         text NOT NULL,            -- normalised: trimmed + uppercased, no spaces
  "regoRaw"      text NOT NULL DEFAULT '',
  "make"         text NOT NULL DEFAULT '',
  "model"        text NOT NULL DEFAULT '',
  "vehicleType"  text NOT NULL DEFAULT '',
  "status"       text NOT NULL DEFAULT 'unknown', -- 'available' | 'out' | 'booked' | 'repair' | 'unknown'
  "isCompanyCar" boolean NOT NULL DEFAULT true,
  "notes"        text NOT NULL DEFAULT '',
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  "updatedAt"    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "onestack_fleet_vehicle_rego_key" ON "onestack_fleet_vehicle" ("tenantId", "rego");
CREATE INDEX IF NOT EXISTS "onestack_fleet_vehicle_tenantId_idx" ON "onestack_fleet_vehicle" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_fleet_vehicle_status_idx" ON "onestack_fleet_vehicle" ("tenantId", "status");

-- ---------------------------------------------------------------- movements (car in / loan car out)
CREATE TABLE IF NOT EXISTS "onestack_fleet_movement" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"         uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "contactId"        uuid REFERENCES "onestack_contact"("id") ON DELETE SET NULL,
  "driverName"       text NOT NULL DEFAULT '',
  "driverPhone"      text NOT NULL DEFAULT '',
  "ownerName"        text NOT NULL DEFAULT '',
  "ownerPhone"       text NOT NULL DEFAULT '',
  "carsInRego"       text NOT NULL DEFAULT '',   -- the customer's car coming in (normalised)
  "carsInRegoRaw"    text NOT NULL DEFAULT '',
  "carsOutVehicleId" uuid REFERENCES "onestack_fleet_vehicle"("id") ON DELETE SET NULL,
  "carsOutRego"      text NOT NULL DEFAULT '',   -- the fleet car going out (normalised)
  "carsOutRegoRaw"   text NOT NULL DEFAULT '',
  "purpose"          text NOT NULL DEFAULT '',   -- RENT | COURTESY | REPAIRS | TOWED | SWAP | PICKUP | RETURN | INTAKE | HANDBACK | OTHER
  "movedAt"          timestamptz,
  "status"           text NOT NULL DEFAULT 'active', -- 'active' | 'returned' | 'closed'
  "needsReview"      boolean NOT NULL DEFAULT false,
  "reviewReason"     text NOT NULL DEFAULT '',
  "notes"            text NOT NULL DEFAULT '',
  "staffName"        text NOT NULL DEFAULT '',
  "createdByUserId"  uuid,
  "updatedByUserId"  uuid,
  "createdAt"        timestamptz NOT NULL DEFAULT now(),
  "updatedAt"        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_fleet_movement_tenantId_idx" ON "onestack_fleet_movement" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_fleet_movement_status_idx" ON "onestack_fleet_movement" ("tenantId", "status");
CREATE INDEX IF NOT EXISTS "onestack_fleet_movement_carsOut_idx" ON "onestack_fleet_movement" ("tenantId", "carsOutRego");
CREATE INDEX IF NOT EXISTS "onestack_fleet_movement_carsIn_idx" ON "onestack_fleet_movement" ("tenantId", "carsInRego");
CREATE INDEX IF NOT EXISTS "onestack_fleet_movement_movedAt_idx" ON "onestack_fleet_movement" ("tenantId", "movedAt");
CREATE INDEX IF NOT EXISTS "onestack_fleet_movement_review_idx" ON "onestack_fleet_movement" ("tenantId", "needsReview");

-- ---------------------------------------------------------------- returns (fleet car comes back)
CREATE TABLE IF NOT EXISTS "onestack_fleet_return" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "movementId"        uuid REFERENCES "onestack_fleet_movement"("id") ON DELETE SET NULL,
  "contactId"         uuid REFERENCES "onestack_contact"("id") ON DELETE SET NULL,
  "returnedVehicleId" uuid REFERENCES "onestack_fleet_vehicle"("id") ON DELETE SET NULL,
  "returnedRego"      text NOT NULL DEFAULT '',
  "returnedRegoRaw"   text NOT NULL DEFAULT '',
  "driverName"        text NOT NULL DEFAULT '',
  "mobileNumber"      text NOT NULL DEFAULT '',
  "returnedAt"        timestamptz,
  "bondStatus"        text NOT NULL DEFAULT '',
  "notes"             text NOT NULL DEFAULT '',
  "staffName"         text NOT NULL DEFAULT '',
  "needsReview"       boolean NOT NULL DEFAULT false,
  "reviewReason"      text NOT NULL DEFAULT '',
  "createdByUserId"   uuid,
  "updatedByUserId"   uuid,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedAt"         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_fleet_return_tenantId_idx" ON "onestack_fleet_return" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_fleet_return_rego_idx" ON "onestack_fleet_return" ("tenantId", "returnedRego");
CREATE INDEX IF NOT EXISTS "onestack_fleet_return_returnedAt_idx" ON "onestack_fleet_return" ("tenantId", "returnedAt");
CREATE INDEX IF NOT EXISTS "onestack_fleet_return_review_idx" ON "onestack_fleet_return" ("tenantId", "needsReview");

-- ---------------------------------------------------------------- bookings (reserve a fleet car)
CREATE TABLE IF NOT EXISTS "onestack_fleet_booking" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"         uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "vehicleId"        uuid REFERENCES "onestack_fleet_vehicle"("id") ON DELETE SET NULL,
  "vehicleRego"      text NOT NULL DEFAULT '',
  "contactId"        uuid REFERENCES "onestack_contact"("id") ON DELETE SET NULL,
  "bookingName"      text NOT NULL DEFAULT '',
  "bookingMobile"    text NOT NULL DEFAULT '',
  "startAt"          timestamptz NOT NULL,
  "expectedReturnAt" timestamptz,
  "purpose"          text NOT NULL DEFAULT '',
  "status"           text NOT NULL DEFAULT 'booked', -- 'booked' | 'active' | 'completed' | 'cancelled'
  "notes"            text NOT NULL DEFAULT '',
  "createdByUserId"  uuid,
  "updatedByUserId"  uuid,
  "createdAt"        timestamptz NOT NULL DEFAULT now(),
  "updatedAt"        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_fleet_booking_tenantId_idx" ON "onestack_fleet_booking" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_fleet_booking_vehicle_idx" ON "onestack_fleet_booking" ("tenantId", "vehicleRego", "status");
CREATE INDEX IF NOT EXISTS "onestack_fleet_booking_startAt_idx" ON "onestack_fleet_booking" ("tenantId", "startAt");

-- ---------------------------------------------------------------- photos (before/after, damage, etc.)
CREATE TABLE IF NOT EXISTS "onestack_fleet_photo" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        uuid NOT NULL REFERENCES "onestack_tenant"("id"),
  "vehicleId"       uuid REFERENCES "onestack_fleet_vehicle"("id") ON DELETE SET NULL,
  "movementId"      uuid REFERENCES "onestack_fleet_movement"("id") ON DELETE CASCADE,
  "returnId"        uuid REFERENCES "onestack_fleet_return"("id") ON DELETE CASCADE,
  "bookingId"       uuid REFERENCES "onestack_fleet_booking"("id") ON DELETE CASCADE,
  "photoType"       text NOT NULL DEFAULT 'other', -- 'before_handover' | 'after_return' | 'damage' | 'odometer' | 'fuel' | 'tow_card' | 'other'
  "storagePath"     text NOT NULL,
  "contentType"     text NOT NULL DEFAULT 'image/jpeg',
  "notes"           text NOT NULL DEFAULT '',
  "uploadedByUserId" uuid,
  "uploadedAt"      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "onestack_fleet_photo_tenantId_idx" ON "onestack_fleet_photo" ("tenantId");
CREATE INDEX IF NOT EXISTS "onestack_fleet_photo_movement_idx" ON "onestack_fleet_photo" ("tenantId", "movementId");
CREATE INDEX IF NOT EXISTS "onestack_fleet_photo_return_idx" ON "onestack_fleet_photo" ("tenantId", "returnId");

-- ---------------------------------------------------------------- grants
GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_fleet_vehicle"  TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_fleet_movement" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_fleet_return"   TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_fleet_booking"  TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "onestack_fleet_photo"    TO app_user;

-- ---------------------------------------------------------------- forced RLS + tenant-isolation policy
ALTER TABLE "onestack_fleet_vehicle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_fleet_vehicle" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_fleet_vehicle";
CREATE POLICY "tenant_isolation" ON "onestack_fleet_vehicle" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "onestack_fleet_movement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_fleet_movement" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_fleet_movement";
CREATE POLICY "tenant_isolation" ON "onestack_fleet_movement" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "onestack_fleet_return" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_fleet_return" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_fleet_return";
CREATE POLICY "tenant_isolation" ON "onestack_fleet_return" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "onestack_fleet_booking" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_fleet_booking" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_fleet_booking";
CREATE POLICY "tenant_isolation" ON "onestack_fleet_booking" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "onestack_fleet_photo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onestack_fleet_photo" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "onestack_fleet_photo";
CREATE POLICY "tenant_isolation" ON "onestack_fleet_photo" FOR ALL
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
