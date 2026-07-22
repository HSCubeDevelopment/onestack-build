-- Create onestack_fleet_photo rows for the migrated In N Out photos (migration plan §10). Run AFTER
-- import-innout-photos.mjs has copied the image bytes into OneStack Storage and written its success log.
--
-- Convert that success log (photos_done.jsonl) to CSV with header columns:
--   id,vehicle_id,movement_id,return_id,booking_id,photo_type,storage_path,content_type,notes,uploaded_at
-- (nulls as empty fields), then:
--   psql "$DATABASE_URL" -v DEMO='<tenant-uuid>' -f import-innout-photos.sql
--
-- Idempotent (upsert by source photo id). FK columns are nulled when the referenced vehicle/movement/
-- return/booking wasn't imported, so no photo row is ever rejected. `storage_path` here is the OneStack
-- object path (<tenant>/<sourcePhotoId>); FleetPhotoService.getContent streams the bytes from Storage.
--
-- First real run (22 Jul 2026): 614 rows (603 → movements, 9 → vehicles, 2 → returns, 0 orphaned).
\set ON_ERROR_STOP on

create temp table s_photos(
  id uuid, vehicle_id uuid, movement_id uuid, return_id uuid, booking_id uuid,
  photo_type text, storage_path text, content_type text, notes text, uploaded_at timestamptz
);
\copy s_photos from 'photos_load.csv' csv header

begin;
insert into onestack_fleet_photo
  (id,"tenantId","vehicleId","movementId","returnId","bookingId","photoType","storagePath","contentType",
   notes,"uploadedByUserId","uploadedAt")
select
  p.id, :'DEMO',
  case when exists (select 1 from onestack_fleet_vehicle  v where v.id = p.vehicle_id  and v."tenantId"=:'DEMO') then p.vehicle_id  end,
  case when exists (select 1 from onestack_fleet_movement m where m.id = p.movement_id and m."tenantId"=:'DEMO') then p.movement_id end,
  case when exists (select 1 from onestack_fleet_return   r where r.id = p.return_id   and r."tenantId"=:'DEMO') then p.return_id   end,
  case when exists (select 1 from onestack_fleet_booking  b where b.id = p.booking_id  and b."tenantId"=:'DEMO') then p.booking_id  end,
  coalesce(p.photo_type,'other'), p.storage_path, coalesce(p.content_type,'image/jpeg'),
  coalesce(p.notes,''), null, coalesce(p.uploaded_at, now())
from s_photos p
on conflict (id) do update
  set "storagePath" = excluded."storagePath", "contentType" = excluded."contentType",
      "vehicleId" = excluded."vehicleId", "movementId" = excluded."movementId",
      "returnId" = excluded."returnId", "bookingId" = excluded."bookingId";
commit;

select 'photos' k, count(*) from onestack_fleet_photo where "tenantId"=:'DEMO';
