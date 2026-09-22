#!/usr/bin/env bash
# Run one command with a specific env file loaded, and nothing else.
#
#   bash scripts/with-env.sh .env.supabase npm run check:rls
#   bash scripts/with-env.sh .env.supabase npm run start:dev
#
# Why this exists: `set -a; . .env.supabase; set +a` in your own terminal leaves SUPABASE_URL exported
# for the rest of the session, and any later `npm run start:dev` then silently picks Supabase Storage
# and a remote database. `exec` confines the environment to a single process.
#
# The env file must be COMPLETE. dotenv does not override already-set variables, so a file that omits
# a key gets it silently backfilled from apps/api/.env — which is how you end up doing privileged
# reads against one database and request reads against another, with no error anywhere.
set -euo pipefail

f="${1:?usage: with-env.sh <env-file> <command...>}"
shift
[ $# -gt 0 ] || { echo "usage: with-env.sh <env-file> <command...>" >&2; exit 2; }
[ -f "$f" ] || { echo "no such env file: $f" >&2; exit 1; }

set -a
# shellcheck disable=SC1090
. "$f"
set +a

# Announce the target with credentials stripped, so a run against a remote database is never a surprise.
printf '\033[1m── env: %s → %s\033[0m\n' \
  "$f" "$(printf '%s' "${DATABASE_URL:-<unset>}" | sed -E 's#://[^@]*@#://***@#')" >&2

exec "$@"
