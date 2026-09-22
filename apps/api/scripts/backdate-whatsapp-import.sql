-- Put the real WhatsApp dates on the imported notes and photos.
--
--   cd <export-dir>            -- \copy reads RELATIVE paths; running this from elsewhere fails oddly
--   bash scripts/with-env.sh .env.supabase psql "$DATABASE_URL" \
--     -v DEMO='0d15ea5e-0000-4000-8000-000000000001' \
--     -f <repo>/apps/api/scripts/backdate-whatsapp-import.sql
--
-- WHY THIS EXISTS. The API stamps now() on everything it writes and offers no way to say otherwise:
-- NoteService.add takes (tenantId, workItemId, authorUserId, body) and nothing else, and notes are
-- deliberately append-only. Without this pass, two years of service history all reads as "today".
--
-- It matters for more than tidiness. Attachments produce NO timeline events — only jobs and notes do —
-- so the backdated note is the only thing that puts a date on a car's history in the app.
--
-- Re-runnable: it only ever moves a row from now() to its recorded date, and matching is on keys that
-- do not change (the visit ref inside the note, the WhatsApp filename on the photo).

\set ON_ERROR_STOP on
\timing on

BEGIN;

-- These tables FORCE row-level security. Without the tenant set, every statement below silently
-- matches zero rows and reports a cheerful success.
SELECT set_config('app.current_tenant_id', :'DEMO', true);

CREATE TEMP TABLE wa_note_dates (ref text PRIMARY KEY, at timestamptz) ON COMMIT DROP;
CREATE TEMP TABLE wa_photo_dates (file_name text PRIMARY KEY, at timestamptz) ON COMMIT DROP;

\copy wa_note_dates (ref, at) FROM 'whatsapp-note-dates.csv' WITH (FORMAT csv, HEADER true)
\copy wa_photo_dates (file_name, at) FROM 'whatsapp-photo-dates.csv' WITH (FORMAT csv, HEADER true)

-- ---------------------------------------------------------------- dry run
\echo ''
\echo 'BEFORE — what will change:'

SELECT
  count(*) FILTER (WHERE n."createdAt"::date <> d.at::date) AS notes_to_move,
  count(*)                                                  AS notes_matched,
  (SELECT count(*) FROM wa_note_dates)                      AS notes_in_csv
FROM onestack_work_item_note n
JOIN wa_note_dates d ON n.body LIKE '%ref ' || d.ref || '%'
WHERE n."tenantId" = :'DEMO'::uuid;

SELECT
  count(*) FILTER (WHERE a."createdAt"::date <> d.at::date) AS photos_to_move,
  count(*)                                                  AS photos_matched,
  (SELECT count(*) FROM wa_photo_dates)                     AS photos_in_csv
FROM onestack_work_item_attachment a
JOIN wa_photo_dates d ON d.file_name = a."fileName"
WHERE a."tenantId" = :'DEMO'::uuid;

-- ------------------------------------------------------------------ apply
UPDATE onestack_work_item_note n
SET "createdAt" = d.at
FROM wa_note_dates d
WHERE n."tenantId" = :'DEMO'::uuid
  AND n.body LIKE '%ref ' || d.ref || '%'
  AND n."createdAt" <> d.at;

UPDATE onestack_work_item_attachment a
SET "createdAt" = d.at
FROM wa_photo_dates d
WHERE a."tenantId" = :'DEMO'::uuid
  AND a."fileName" = d.file_name
  AND a."createdAt" <> d.at;

-- ----------------------------------------------------------------- verify
\echo ''
\echo 'AFTER — anything still stamped today is a row this did not reach:'

SELECT
  count(*) FILTER (WHERE n."createdAt"::date = current_date) AS notes_still_today,
  min(n."createdAt")::date                                   AS earliest,
  max(n."createdAt")::date                                   AS latest
FROM onestack_work_item_note n
WHERE n."tenantId" = :'DEMO'::uuid
  AND n.body LIKE 'Imported from the workshop WhatsApp group%';

SELECT
  count(*) FILTER (WHERE a."createdAt"::date = current_date) AS photos_still_today,
  min(a."createdAt")::date                                   AS earliest,
  max(a."createdAt")::date                                   AS latest
FROM onestack_work_item_attachment a
WHERE a."tenantId" = :'DEMO'::uuid
  AND a.caption = 'Service photo';

COMMIT;
