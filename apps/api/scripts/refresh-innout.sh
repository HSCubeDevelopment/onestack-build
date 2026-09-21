#!/usr/bin/env bash
# Refresh the OneStack fleet module from the live In N Out Supabase. Safe to re-run.
#
#   npm run refresh:innout              # rows + photo bytes
#   npm run refresh:innout -- --rows-only   # rows only (~10s; the common case)
#   npm run refresh:innout -- --dry-run     # report what would change, write nothing
#
# IN N OUT WINS: every run overwrites the OneStack copy. See the warning in refresh-innout-fleet.sql.
# Run this only while OneStack is read-only pre-cutover.
set -euo pipefail

SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API="$(dirname "$SCRIPTS")"
WORK="${INNOUT_WORK_DIR:-$SCRIPTS/.innout-work}"
INNOUT_ENV_FILE="${INNOUT_ENV_FILE:-$HOME/code/in-n-out/.env}"

ROWS_ONLY=false
DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --rows-only) ROWS_ONLY=true ;;
    --dry-run)   DRY_RUN=true; ROWS_ONLY=true ;;
    -h|--help)   sed -n '2,9p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

say() { printf '\n\033[1m── %s\033[0m\n' "$1"; }

# ── Target credentials ───────────────────────────────────────────────────────────────────────
[ -f "$API/.env" ] || { echo "missing $API/.env" >&2; exit 1; }
set -a; . "$API/.env"; set +a
: "${DATABASE_URL:?DATABASE_URL not set in apps/api/.env}"
: "${DEMO_TENANT_ID:?DEMO_TENANT_ID not set in apps/api/.env}"

# ── Source credentials — read ONLY these two values. Do NOT source this file. ────────────────
# Sourcing it would export SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY into the environment, and
# fleet.module.ts resolves storage as Supabase ?? Filesystem ?? InMemory — so any API started from
# such a shell would pick Supabase Storage, point at a bucket that does not exist locally, and 404
# every single photo read.
[ -f "$INNOUT_ENV_FILE" ] || { echo "missing $INNOUT_ENV_FILE (set INNOUT_ENV_FILE)" >&2; exit 1; }
INNOUT_URL=$(grep -E '^SUPABASE_URL=' "$INNOUT_ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'"'"' ')
INNOUT_KEY=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' "$INNOUT_ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'"'"' ')
[ -n "$INNOUT_URL" ] && [ -n "$INNOUT_KEY" ] || { echo "could not read source credentials" >&2; exit 1; }

# ── Preflight ────────────────────────────────────────────────────────────────────────────────
for c in python3 node curl psql; do
  command -v "$c" >/dev/null || { echo "missing required command: $c" >&2; exit 1; }
done
psql "$DATABASE_URL" -tAc 'select 1' >/dev/null || { echo "cannot reach $DATABASE_URL" >&2; exit 1; }
if [ "$ROWS_ONLY" = false ]; then
  : "${FLEET_PHOTO_DIR:?FLEET_PHOTO_DIR not set in apps/api/.env (needed for photo bytes)}"
  mkdir -p "$FLEET_PHOTO_DIR"
fi
mkdir -p "$WORK"

# ── 1. Export ────────────────────────────────────────────────────────────────────────────────
say "exporting from In N Out"
OUT_DIR="$WORK" SUPABASE_URL="$INNOUT_URL" SUPABASE_SERVICE_ROLE_KEY="$INNOUT_KEY" \
  python3 "$SCRIPTS/export-innout-source.py"

# Delete tombstones, so the absence list can be classified rather than guessed at. The source's
# audit trigger stores the action LOWERCASE ('delete', not 'DELETE') — eq.DELETE silently returns [].
curl -sS --fail --max-time 60 \
  "$INNOUT_URL/rest/v1/audit_logs?action=eq.delete&select=table_name,record_id,created_at&order=created_at" \
  -H "apikey: $INNOUT_KEY" -H "Authorization: Bearer $INNOUT_KEY" \
  > "$WORK/deletes.json" || echo "  (tombstone fetch failed — absence list will be unclassified)"

# ── 2. Rows ──────────────────────────────────────────────────────────────────────────────────
# cd is required: the \copy paths in the SQL are relative.
say "upserting rows$([ "$DRY_RUN" = true ] && echo ' (dry run)')"
( cd "$WORK" && psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -P pager=off \
    -v DEMO="$DEMO_TENANT_ID" -v STALE_DAYS="${STALE_DAYS:-30}" -v DRYRUN="$DRY_RUN" \
    -f "$SCRIPTS/refresh-innout-fleet.sql" )

if [ -s "$WORK/deletes.json" ]; then
  node -e "
    const d = JSON.parse(require('fs').readFileSync('$WORK/deletes.json','utf8'));
    const by = {};
    for (const r of d) by[r.table_name] = (by[r.table_name] ?? 0) + 1;
    const summary = Object.entries(by).map(([k, v]) => k + ' ' + v).join(', ') || 'none';
    console.log('  source delete tombstones: ' + d.length + ' (' + summary + ')');
    if (d.length) console.log('  most recent: ' + d[d.length - 1].created_at.slice(0, 10) +
      ' — cross-check any absence rows above against these before acting on them');
  "
fi

if [ "$ROWS_ONLY" = true ]; then
  say "done (rows only)"
  exit 0
fi

# ── 3. Photo bytes — incremental via the ledger, which is never deleted between runs ─────────
say "downloading new photo bytes"
SRC_URL="$INNOUT_URL" SRC_KEY="$INNOUT_KEY" TENANT="$DEMO_TENANT_ID" DEST="$FLEET_PHOTO_DIR" \
PHOTOS="$WORK/photos.jsonl" OUT="$WORK/photos_done.jsonl" BUCKET="${INNOUT_BUCKET:-photos}" \
CONCURRENCY="${CONCURRENCY:-6}" node "$SCRIPTS/download-innout-photos.mjs"

# ── 4. Photo rows ────────────────────────────────────────────────────────────────────────────
say "upserting photo rows"
node "$SCRIPTS/innout-photos-jsonl-to-csv.mjs" "$WORK/photos_done.jsonl" "$WORK/photos_load.csv"
( cd "$WORK" && psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -P pager=off \
    -v DEMO="$DEMO_TENANT_ID" -f "$SCRIPTS/import-innout-photos.sql" )

# ── 5. Photo integrity ───────────────────────────────────────────────────────────────────────
# Every photo ROW must have bytes on disk, or GET /fleet/photos/:id/content 404s. The reverse
# (bytes with no row) is expected and fine — OneStack-native uploads live here too.
say "verifying photo bytes"
# NB: use `if`, not an `&&` chain — under `set -o pipefail` a loop body that ends false makes the
# whole pipeline non-zero, so a fully-healthy run would abort here.
missing=$(psql "$DATABASE_URL" -tA \
  -c "select \"storagePath\" from onestack_fleet_photo where \"tenantId\" = '$DEMO_TENANT_ID'" \
  | while read -r p; do
      if [ -n "$p" ] && [ ! -f "$FLEET_PHOTO_DIR/$p" ]; then echo "$p"; fi
    done | wc -l | tr -d ' ')
if [ "$missing" != "0" ]; then
  echo "  ⚠ $missing photo row(s) have NO bytes on disk — those will 404" >&2
  exit 1
fi
echo "  all photo rows have bytes on disk"
echo "  disk: $(du -sh "$FLEET_PHOTO_DIR" | cut -f1) across $(find "$FLEET_PHOTO_DIR" -type f | wc -l | tr -d ' ') files"

say "done"
