-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- In N Out → OneStack Fleet — RE-RUNNABLE REFRESH.
--
-- Companion to import-innout-fleet.sql, which is the one-shot INITIAL load and does a destructive
-- full replace. This file never deletes: it UPSERTS by source id, so it is safe to run repeatedly
-- while In N Out is still the system of record. Keep the two files in sync when columns change.
--
-- ⚠ IN N OUT WINS. Every run overwrites status, needsReview and reviewReason from the source and then
--   re-derives them. Any triage done in OneStack — POST /fleet/review/clear, PATCH /fleet/vehicles/:id,
--   PATCH /fleet/movements/:id — is SILENTLY REVERTED by the next refresh. That is acceptable only
--   while OneStack is read-only pre-cutover. Stop running this the day anyone uses OneStack for real.
--
-- HOW TO RUN — normally via `npm run refresh:innout`, which handles the export and the photo steps.
-- By hand, from the directory holding the CSVs written by export-innout-source.py:
--   psql "$DATABASE_URL" -v DEMO='<tenant-uuid>' -v STALE_DAYS=30 -f refresh-innout-fleet.sql
-- The \copy paths below are RELATIVE — running from the wrong directory fails confusingly.
--
-- The connection must reach the rows: the Homebrew superuser bypasses RLS; any other role relies on
-- the set_config below. Tables are FORCE ROW LEVEL SECURITY, which binds even the table owner.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
\set ON_ERROR_STOP on
\if :{?STALE_DAYS} \else \set STALE_DAYS 30 \endif
\if :{?DRYRUN} \else \set DRYRUN false \endif

create temp table s_veh(id uuid, rego text, rego_raw text, make text, model text, vtype text, status text, is_company boolean, notes text, created_at timestamptz, updated_at timestamptz);
\copy s_veh from 'veh.csv' csv header
create temp table s_mov(id uuid, driver_name text, driver_phone text, owner_name text, owner_phone text, cars_in_rego text, cars_in_rego_raw text, cars_out_vehicle_id uuid, cars_out_rego text, cars_out_rego_raw text, purpose text, moved_at timestamptz, status text, needs_review boolean, review_reason text, notes text, staff_name text, created_at timestamptz, updated_at timestamptz);
\copy s_mov from 'mov.csv' csv header
create temp table s_ret(id uuid, movement_id uuid, returned_vehicle_id uuid, returned_rego text, returned_rego_raw text, driver_name text, mobile_number text, returned_at timestamptz, bond_status text, notes text, needs_review boolean, review_reason text, staff_name text, created_at timestamptz, updated_at timestamptz);
\copy s_ret from 'ret.csv' csv header
create temp table s_bok(id uuid, vehicle_id uuid, vehicle_rego text, booking_name text, booking_mobile text, start_at timestamptz, expected_return_at timestamptz, purpose text, status text, notes text, created_at timestamptz, updated_at timestamptz);
\copy s_bok from 'bok.csv' csv header

begin;

-- Set tenant context so this works under a non-superuser role too (no-op for a superuser).
select set_config('app.current_tenant_id', :'DEMO', true);

-- ── Guard 1: cross-tenant collision ──────────────────────────────────────────────────────────
-- `on conflict (id)` arbitrates on the PRIMARY KEY alone. If a source id somehow already existed
-- under a different tenant, and this connection bypasses RLS (the superuser does), the upsert would
-- silently rewrite another tenant's row. Refuse rather than risk it — CLAUDE.md §7.
-- NB: psql does NOT interpolate :'DEMO' inside a dollar-quoted body — it is an opaque string there.
-- Read the tenant back from the transaction-local setting established above instead.
do $$
declare n int; t uuid := current_setting('app.current_tenant_id')::uuid;
begin
  select count(*) into n from (
    select s.id from s_veh s join onestack_fleet_vehicle  x on x.id = s.id where x."tenantId" <> t
    union all
    select s.id from s_mov s join onestack_fleet_movement x on x.id = s.id where x."tenantId" <> t
    union all
    select s.id from s_ret s join onestack_fleet_return   x on x.id = s.id where x."tenantId" <> t
    union all
    select s.id from s_bok s join onestack_fleet_booking  x on x.id = s.id where x."tenantId" <> t
  ) y;
  if n > 0 then
    raise exception 'ABORT: % source id(s) already exist under a DIFFERENT tenant', n;
  end if;
end $$;

-- ── Guard 2: park regos claimed by a different source id ─────────────────────────────────────
-- onestack_fleet_vehicle has a UNIQUE index on ("tenantId", rego), and `on conflict (id)` cannot
-- arbitrate a second constraint. If the source hard-deletes a vehicle and recreates it under a new
-- id with the same rego — or two vehicles swap regos — the insert hits that index and the WHOLE
-- refresh aborts. (12 vehicles have already been hard-deleted in the source.) Park the old row's
-- rego out of the way first. Rows the source still owns get their real rego back in the upsert
-- below (matched by id); genuinely orphaned rows keep the sentinel and show up in the report.
-- Stable across runs: once parked, the rego no longer matches any source rego, so this never re-fires.
update onestack_fleet_vehicle v
set rego = '~ORPHAN~' || v.id::text
where v."tenantId" = :'DEMO'
  and exists (select 1 from s_veh s where s.rego = v.rego and s.id <> v.id);

-- ── Vehicles ─────────────────────────────────────────────────────────────────────────────────
insert into onestack_fleet_vehicle
  (id,"tenantId",rego,"regoRaw",make,model,"vehicleType",status,"isCompanyCar",notes,"createdAt","updatedAt")
select s.id, :'DEMO', s.rego, coalesce(s.rego_raw,''), coalesce(s.make,''), coalesce(s.model,''),
       coalesce(s.vtype,''), coalesce(s.status,'unknown'), coalesce(s.is_company,true),
       coalesce(s.notes,''), coalesce(s.created_at, now()), coalesce(s.updated_at, now())
from s_veh s
on conflict (id) do update set
  rego           = excluded.rego,
  "regoRaw"      = excluded."regoRaw",
  make           = excluded.make,
  model          = excluded.model,
  "vehicleType"  = excluded."vehicleType",
  status         = excluded.status,
  "isCompanyCar" = excluded."isCompanyCar",
  notes          = excluded.notes,
  "createdAt"    = excluded."createdAt",
  "updatedAt"    = excluded."updatedAt"
where onestack_fleet_vehicle."tenantId" = :'DEMO';
-- DELIBERATELY NOT SET: id, "tenantId". This table has no OneStack-only columns.

-- ── Movements ────────────────────────────────────────────────────────────────────────────────
-- The export is five independent paginated reads, not a snapshot, so a row deleted mid-export can
-- leave a dangling FK. Null the reference instead of aborting; the next refresh restores it.
insert into onestack_fleet_movement
  (id,"tenantId","contactId","driverName","driverPhone","ownerName","ownerPhone","carsInRego","carsInRegoRaw",
   "carsOutVehicleId","carsOutRego","carsOutRegoRaw",purpose,"movedAt",status,"needsReview","reviewReason",
   notes,"staffName","createdByUserId","updatedByUserId","createdAt","updatedAt")
select s.id, :'DEMO', null, coalesce(s.driver_name,''), coalesce(s.driver_phone,''),
       coalesce(s.owner_name,''), coalesce(s.owner_phone,''), coalesce(s.cars_in_rego,''),
       coalesce(s.cars_in_rego_raw,''),
       case when exists (select 1 from onestack_fleet_vehicle v
                         where v.id = s.cars_out_vehicle_id and v."tenantId" = :'DEMO')
            then s.cars_out_vehicle_id end,
       coalesce(s.cars_out_rego,''), coalesce(s.cars_out_rego_raw,''),
       coalesce(s.purpose,''), s.moved_at, coalesce(s.status,'active'),
       coalesce(s.needs_review,false), coalesce(s.review_reason,''), coalesce(s.notes,''),
       coalesce(s.staff_name,''), null, null,
       coalesce(s.created_at, now()), coalesce(s.updated_at, now())
from s_mov s
on conflict (id) do update set
  "driverName"       = excluded."driverName",
  "driverPhone"      = excluded."driverPhone",
  "ownerName"        = excluded."ownerName",
  "ownerPhone"       = excluded."ownerPhone",
  "carsInRego"       = excluded."carsInRego",
  "carsInRegoRaw"    = excluded."carsInRegoRaw",
  "carsOutVehicleId" = excluded."carsOutVehicleId",
  "carsOutRego"      = excluded."carsOutRego",
  "carsOutRegoRaw"   = excluded."carsOutRegoRaw",
  purpose            = excluded.purpose,
  "movedAt"          = excluded."movedAt",
  status             = excluded.status,
  "needsReview"      = excluded."needsReview",
  "reviewReason"     = excluded."reviewReason",
  notes              = excluded.notes,
  "staffName"        = excluded."staffName",
  "createdAt"        = excluded."createdAt",
  "updatedAt"        = excluded."updatedAt"
where onestack_fleet_movement."tenantId" = :'DEMO';
-- DELIBERATELY NOT SET: id, "tenantId", "contactId", "createdByUserId", "updatedByUserId".
-- Those are OneStack-side; the source knows nothing about them, so excluded.* is ALWAYS NULL and
-- adding them here would wipe real data the moment contact/user mapping ships.

-- ── Returns ──────────────────────────────────────────────────────────────────────────────────
insert into onestack_fleet_return
  (id,"tenantId","movementId","contactId","returnedVehicleId","returnedRego","returnedRegoRaw","driverName",
   "mobileNumber","returnedAt","bondStatus",notes,"staffName","needsReview","reviewReason",
   "createdByUserId","updatedByUserId","createdAt","updatedAt")
select s.id, :'DEMO',
       case when exists (select 1 from onestack_fleet_movement m
                         where m.id = s.movement_id and m."tenantId" = :'DEMO')
            then s.movement_id end,
       null,
       case when exists (select 1 from onestack_fleet_vehicle v
                         where v.id = s.returned_vehicle_id and v."tenantId" = :'DEMO')
            then s.returned_vehicle_id end,
       coalesce(s.returned_rego,''), coalesce(s.returned_rego_raw,''), coalesce(s.driver_name,''),
       coalesce(s.mobile_number,''), s.returned_at, coalesce(s.bond_status,''), coalesce(s.notes,''),
       coalesce(s.staff_name,''), coalesce(s.needs_review,false), coalesce(s.review_reason,''),
       null, null, coalesce(s.created_at, now()), coalesce(s.updated_at, now())
from s_ret s
on conflict (id) do update set
  "movementId"        = excluded."movementId",
  "returnedVehicleId" = excluded."returnedVehicleId",
  "returnedRego"      = excluded."returnedRego",
  "returnedRegoRaw"   = excluded."returnedRegoRaw",
  "driverName"        = excluded."driverName",
  "mobileNumber"      = excluded."mobileNumber",
  "returnedAt"        = excluded."returnedAt",
  "bondStatus"        = excluded."bondStatus",
  notes               = excluded.notes,
  "staffName"         = excluded."staffName",
  "needsReview"       = excluded."needsReview",
  "reviewReason"      = excluded."reviewReason",
  "createdAt"         = excluded."createdAt",
  "updatedAt"         = excluded."updatedAt"
where onestack_fleet_return."tenantId" = :'DEMO';
-- DELIBERATELY NOT SET: id, "tenantId", "contactId", "createdByUserId", "updatedByUserId".

-- ── Bookings ─────────────────────────────────────────────────────────────────────────────────
insert into onestack_fleet_booking
  (id,"tenantId","vehicleId","vehicleRego","contactId","bookingName","bookingMobile","startAt",
   "expectedReturnAt",purpose,status,notes,"createdByUserId","updatedByUserId","createdAt","updatedAt")
select s.id, :'DEMO',
       case when exists (select 1 from onestack_fleet_vehicle v
                         where v.id = s.vehicle_id and v."tenantId" = :'DEMO')
            then s.vehicle_id end,
       coalesce(s.vehicle_rego,''), null, coalesce(s.booking_name,''), coalesce(s.booking_mobile,''),
       coalesce(s.start_at, now()), s.expected_return_at, coalesce(s.purpose,''),
       coalesce(s.status,'booked'), coalesce(s.notes,''), null, null,
       coalesce(s.created_at, now()), coalesce(s.updated_at, now())
from s_bok s
on conflict (id) do update set
  "vehicleId"        = excluded."vehicleId",
  "vehicleRego"      = excluded."vehicleRego",
  "bookingName"      = excluded."bookingName",
  "bookingMobile"    = excluded."bookingMobile",
  "startAt"          = excluded."startAt",
  "expectedReturnAt" = excluded."expectedReturnAt",
  purpose            = excluded.purpose,
  status             = excluded.status,
  notes              = excluded.notes,
  "createdAt"        = excluded."createdAt",
  "updatedAt"        = excluded."updatedAt"
where onestack_fleet_booking."tenantId" = :'DEMO';
-- DELIBERATELY NOT SET: id, "tenantId", "contactId", "createdByUserId", "updatedByUserId".

-- ── Reconciliation (mirrors import-innout-fleet.sql §8.2 — non-destructive) ───────────────────
-- Runs from a clean baseline each time, because the upserts above reset status/needsReview/
-- reviewReason from the source first.

-- (a) Any non-closed movement that already has a matching return (by out-rego, at/after it) → closed.
--     Pure function of the data; idempotent.
update onestack_fleet_movement m set status = 'closed'
where m."tenantId" = :'DEMO' and m.status <> 'closed' and coalesce(m."carsOutRego",'') <> ''
  and exists (select 1 from onestack_fleet_return r
              where r."tenantId" = :'DEMO' and r."returnedRego" = m."carsOutRego"
                and (r."returnedAt" is null or m."movedAt" is null or r."returnedAt" >= m."movedAt"));

-- (b) Stale open movements → closed + flagged.
--     ⚠ NOT TIME-IDEMPOTENT: this depends on now(), so a loan genuinely open past the window shows
--     'closed' here while In N Out still says 'active'. That divergence is permanent and widens the
--     longer OneStack runs pre-cutover. The report below counts these separately — watch the number.
--     The reviewReason guard keeps the message identical across runs (no appending).
update onestack_fleet_movement m
set status = 'closed', "needsReview" = true,
    "reviewReason" = case when coalesce(m."reviewReason",'') = ''
                          then 'auto-closed: stale open movement (>' || :'STALE_DAYS' || 'd)'
                          else m."reviewReason" end
where m."tenantId" = :'DEMO' and m.status = 'active'
  and (m."movedAt" is null or m."movedAt" < now() - (:'STALE_DAYS' || ' days')::interval);

-- (c) Re-derive vehicle status: out iff a genuinely-active out-movement exists; phantom 'out' → available.
--     The `status <> 'out'` predicate is not in the importer; added so the UPDATE count means something.
update onestack_fleet_vehicle v set status = 'out'
where v."tenantId" = :'DEMO' and v.status <> 'out'
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

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Report — runs INSIDE the transaction, before commit/rollback, so --dry-run shows what WOULD
-- happen rather than the pre-refresh state. MUST stay in this file: it diffs against the temp
-- tables, which die with the session.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
\echo ''
\echo '── counts (target >= source always; the difference is the absence list below) ──'
select 'vehicle' t, (select count(*) from s_veh) source,
       (select count(*) from onestack_fleet_vehicle  where "tenantId"=:'DEMO') target
union all select 'movement', (select count(*) from s_mov),
       (select count(*) from onestack_fleet_movement where "tenantId"=:'DEMO')
union all select 'return',   (select count(*) from s_ret),
       (select count(*) from onestack_fleet_return   where "tenantId"=:'DEMO')
union all select 'booking',  (select count(*) from s_bok),
       (select count(*) from onestack_fleet_booking  where "tenantId"=:'DEMO');

\echo '── freshness (these MUST be equal — proves the newest rows landed, not just the totals) ──'
select (select max(updated_at) from s_mov) source_max_updated,
       (select max("updatedAt") from onestack_fleet_movement where "tenantId"=:'DEMO') target_max_updated;

\echo '── reconciliation, split by cause (watch stale_closed climb = drift from source) ──'
select count(*) filter (where status = 'active')                                        still_active,
       count(*) filter (where status = 'closed' and "reviewReason" like 'auto-closed%')  stale_closed,
       count(*) filter (where "needsReview")                                            flagged
from onestack_fleet_movement where "tenantId"=:'DEMO';

select status, count(*) from onestack_fleet_vehicle where "tenantId"=:'DEMO' group by 1 order by 2 desc;

\echo '── OneStack-only columns (these must NEVER decrease between runs) ──'
select count(*) filter (where "contactId"       is not null) contact_id,
       count(*) filter (where "createdByUserId" is not null) created_by,
       count(*) filter (where "updatedByUserId" is not null) updated_by
from onestack_fleet_movement where "tenantId"=:'DEMO';

\echo '── parked regos (source no longer claims these; investigate before deleting) ──'
select count(*) as parked_orphan_regos
from onestack_fleet_vehicle where "tenantId"=:'DEMO' and rego like '~ORPHAN~%';

\echo '── absences: in OneStack, not in the source. REPORT ONLY — never auto-delete. ──'
\echo '   (a row here is EITHER a source hard-delete OR an OneStack-created row — indistinguishable)'
select t, id, label, created from (
  select 'vehicle' t, v.id::text, v.rego label, v."createdAt" created
  from onestack_fleet_vehicle v
  where v."tenantId"=:'DEMO' and not exists (select 1 from s_veh s where s.id = v.id)
  union all
  select 'movement', m.id::text, coalesce(nullif(m."carsOutRego",''), m."carsInRego"), m."createdAt"
  from onestack_fleet_movement m
  where m."tenantId"=:'DEMO' and not exists (select 1 from s_mov s where s.id = m.id)
  union all
  select 'return', r.id::text, r."returnedRego", r."createdAt"
  from onestack_fleet_return r
  where r."tenantId"=:'DEMO' and not exists (select 1 from s_ret s where s.id = r.id)
  union all
  select 'booking', b.id::text, b."vehicleRego", b."createdAt"
  from onestack_fleet_booking b
  where b."tenantId"=:'DEMO' and not exists (select 1 from s_bok s where s.id = b.id)
) x order by created desc limit 50;

-- Commit last, so a dry run can produce the identical report and then discard everything.
\if :DRYRUN
\echo ''
\echo '*** DRY RUN — rolling back. Nothing above was written. ***'
rollback;
\else
commit;
\endif
