-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- In N Out → OneStack Fleet — historical data import (migration plan §4, §8).
--
-- Moves the shop's real business data from the legacy In N Out Supabase into the OneStack Fleet module
-- (onestack_fleet_*), scoped to the shop's tenant. Faithful 1:1 field mapping; SOURCE UUIDS ARE KEPT so
-- the vehicle ↔ movement ↔ return foreign keys stay intact. Transactional + re-runnable (full replace of
-- the tenant's fleet each run).
--
-- HOW TO RUN (no credentials live in this file):
--   1. Export the four source tables to CSV from the legacy DB (run against the SOURCE database):
--        \copy (select id, rego, rego_raw, make, model, vehicle_type, status, is_company_car, notes,
--                      created_at, updated_at from vehicles) to 'veh.csv' csv header
--        \copy (select id, driver_name, driver_phone, owner_name, owner_phone, cars_in_rego,
--                      cars_in_rego_raw, cars_out_vehicle_id, cars_out_rego, cars_out_rego_raw, purpose,
--                      moved_at, status, needs_review, review_reason, notes, staff_name, created_at,
--                      updated_at from vehicle_movements) to 'mov.csv' csv header
--        \copy (select id, movement_id, returned_vehicle_id, returned_rego, returned_rego_raw,
--                      driver_name, mobile_number, returned_at, bond_status, notes, needs_review,
--                      review_reason, staff_name, created_at, updated_at from vehicle_returns)
--               to 'ret.csv' csv header
--        \copy (select id, vehicle_id, vehicle_rego, booking_name, booking_mobile, start_at,
--                      expected_return_at, purpose, status, notes, created_at, updated_at from bookings)
--               to 'bok.csv' csv header
--   2. From the directory holding the CSVs, run this file against the OneStack DATABASE_URL:
--        psql "$DATABASE_URL" -v DEMO='<tenant-uuid>' -f import-innout-fleet.sql
--      (the connection role must bypass RLS — the Supabase `postgres` role does — or set
--       app.current_tenant_id to the tenant first.)
--
-- First real run (22 Jul 2026): 1316 vehicles, 1760 movements, 2660 returns, 2 bookings imported.
-- Reconciliation collapsed 524 phantom "Out" → 55 genuinely out; 603 records flagged needs_review.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
\set ON_ERROR_STOP on

create temp table s_veh(id uuid, rego text, rego_raw text, make text, model text, vtype text, status text, is_company boolean, notes text, created_at timestamptz, updated_at timestamptz);
\copy s_veh from 'veh.csv' csv header
create temp table s_mov(id uuid, driver_name text, driver_phone text, owner_name text, owner_phone text, cars_in_rego text, cars_in_rego_raw text, cars_out_vehicle_id uuid, cars_out_rego text, cars_out_rego_raw text, purpose text, moved_at timestamptz, status text, needs_review boolean, review_reason text, notes text, staff_name text, created_at timestamptz, updated_at timestamptz);
\copy s_mov from 'mov.csv' csv header
create temp table s_ret(id uuid, movement_id uuid, returned_vehicle_id uuid, returned_rego text, returned_rego_raw text, driver_name text, mobile_number text, returned_at timestamptz, bond_status text, notes text, needs_review boolean, review_reason text, staff_name text, created_at timestamptz, updated_at timestamptz);
\copy s_ret from 'ret.csv' csv header
create temp table s_bok(id uuid, vehicle_id uuid, vehicle_rego text, booking_name text, booking_mobile text, start_at timestamptz, expected_return_at timestamptz, purpose text, status text, notes text, created_at timestamptz, updated_at timestamptz);
\copy s_bok from 'bok.csv' csv header

begin;

-- Clean slate for the tenant's fleet (removes prior test rows + any prior import). FK order.
delete from onestack_fleet_photo    where "tenantId" = :'DEMO';
delete from onestack_fleet_return   where "tenantId" = :'DEMO';
delete from onestack_fleet_booking  where "tenantId" = :'DEMO';
delete from onestack_fleet_movement where "tenantId" = :'DEMO';
delete from onestack_fleet_vehicle  where "tenantId" = :'DEMO';

insert into onestack_fleet_vehicle
  (id,"tenantId",rego,"regoRaw",make,model,"vehicleType",status,"isCompanyCar",notes,"createdAt","updatedAt")
select id, :'DEMO', rego, coalesce(rego_raw,''), coalesce(make,''), coalesce(model,''),
       coalesce(vtype,''), coalesce(status,'unknown'), coalesce(is_company,true),
       coalesce(notes,''), coalesce(created_at, now()), coalesce(updated_at, now())
from s_veh;

insert into onestack_fleet_movement
  (id,"tenantId","contactId","driverName","driverPhone","ownerName","ownerPhone","carsInRego","carsInRegoRaw",
   "carsOutVehicleId","carsOutRego","carsOutRegoRaw",purpose,"movedAt",status,"needsReview","reviewReason",
   notes,"staffName","createdByUserId","updatedByUserId","createdAt","updatedAt")
select id, :'DEMO', null, coalesce(driver_name,''), coalesce(driver_phone,''), coalesce(owner_name,''),
       coalesce(owner_phone,''), coalesce(cars_in_rego,''), coalesce(cars_in_rego_raw,''),
       cars_out_vehicle_id, coalesce(cars_out_rego,''), coalesce(cars_out_rego_raw,''),
       coalesce(purpose,''), moved_at, coalesce(status,'active'), coalesce(needs_review,false),
       coalesce(review_reason,''), coalesce(notes,''), coalesce(staff_name,''), null, null,
       coalesce(created_at, now()), coalesce(updated_at, now())
from s_mov;

insert into onestack_fleet_return
  (id,"tenantId","movementId","contactId","returnedVehicleId","returnedRego","returnedRegoRaw","driverName",
   "mobileNumber","returnedAt","bondStatus",notes,"staffName","needsReview","reviewReason",
   "createdByUserId","updatedByUserId","createdAt","updatedAt")
select id, :'DEMO', movement_id, null, returned_vehicle_id, coalesce(returned_rego,''),
       coalesce(returned_rego_raw,''), coalesce(driver_name,''), coalesce(mobile_number,''), returned_at,
       coalesce(bond_status,''), coalesce(notes,''), coalesce(staff_name,''), coalesce(needs_review,false),
       coalesce(review_reason,''), null, null, coalesce(created_at, now()), coalesce(updated_at, now())
from s_ret;

insert into onestack_fleet_booking
  (id,"tenantId","vehicleId","vehicleRego","contactId","bookingName","bookingMobile","startAt",
   "expectedReturnAt",purpose,status,notes,"createdByUserId","updatedByUserId","createdAt","updatedAt")
select id, :'DEMO', vehicle_id, coalesce(vehicle_rego,''), null, coalesce(booking_name,''),
       coalesce(booking_mobile,''), coalesce(start_at, now()), expected_return_at, coalesce(purpose,''),
       coalesce(status,'booked'), coalesce(notes,''), null, null,
       coalesce(created_at, now()), coalesce(updated_at, now())
from s_bok;

-- ── Reconciliation (§8.2, non-destructive — closes + flags stale, never deletes) ───────────────
-- (a) Any non-closed movement that already has a matching return (by out-rego, at/after it) → closed.
update onestack_fleet_movement m set status = 'closed'
where m."tenantId" = :'DEMO' and m.status <> 'closed' and coalesce(m."carsOutRego",'') <> ''
  and exists (select 1 from onestack_fleet_return r
              where r."tenantId" = :'DEMO' and r."returnedRego" = m."carsOutRego"
                and (r."returnedAt" is null or m."movedAt" is null or r."returnedAt" >= m."movedAt"));

-- (b) Stale open movements (still active, moved >30 days ago / undated, no return) → closed + flagged.
update onestack_fleet_movement m
set status = 'closed', "needsReview" = true,
    "reviewReason" = case when coalesce(m."reviewReason",'') = '' then 'auto-closed: stale open movement (>30d)'
                          else m."reviewReason" end
where m."tenantId" = :'DEMO' and m.status = 'active'
  and (m."movedAt" is null or m."movedAt" < now() - interval '30 days');

-- (c) Re-derive vehicle status: out iff a genuinely-active out-movement exists; phantom 'out' → available.
update onestack_fleet_vehicle v set status = 'out'
where v."tenantId" = :'DEMO'
  and exists (select 1 from onestack_fleet_movement m
              where m."tenantId" = :'DEMO' and m.status = 'active'
                and (m."carsOutVehicleId" = v.id
                     or (coalesce(m."carsOutRego",'') <> '' and m."carsOutRego" = v.rego)));

update onestack_fleet_vehicle v set status = 'available'
where v."tenantId" = :'DEMO' and v.status = 'out'
  and not exists (select 1 from onestack_fleet_movement m
                  where m."tenantId" = :'DEMO' and m.status = 'active'
                    and (m."carsOutVehicleId" = v.id
                         or (coalesce(m."carsOutRego",'') <> '' and m."carsOutRego" = v.rego)));

commit;
