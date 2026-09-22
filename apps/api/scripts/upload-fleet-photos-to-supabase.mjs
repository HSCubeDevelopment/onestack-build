// Copy fleet photo bytes from a local directory into OneStack's private Supabase Storage bucket.
//
// Used for a PARTIAL migration: the backlog is larger than the storage quota, so only photos newer
// than SINCE go up, newest first, until MAX_BYTES is reached. The rest keep serving from disk via
// FallbackFleetPhotoStorage, so nothing 404s.
//
// No photo ROWS change: storagePath is already `<tenantId>/<photoId>`, which is exactly the bucket
// layout SupabaseFleetPhotoStorage reads. This is a pure byte copy.
//
// Build the manifest from the DATABASE (not the In N Out download ledger, which cannot see photos
// uploaded through OneStack itself), newest first — the ordering is load-bearing, because when
// MAX_BYTES runs out the budget must have been spent on the newest photos:
//
//   psql "$DATABASE_URL" -tAc "
//     select json_build_object('id', id, 'storage_path', \"storagePath\",
//                              'content_type', \"contentType\", 'uploaded_at', \"uploadedAt\")
//     from onestack_fleet_photo where \"tenantId\" = '<tenant>'
//     order by \"uploadedAt\" desc" > photos_manifest.jsonl
//
// env: SRC_DIR (the FLEET_PHOTO_DIR root), TGT_URL, TGT_KEY, TENANT,
//      BUCKET (default onestack_documents), MANIFEST, OUT, SINCE (ISO date), MAX_BYTES, DRY_RUN
import { appendFileSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const { SRC_DIR, TGT_URL, TGT_KEY, TENANT } = process.env;
const BUCKET = process.env.BUCKET || 'onestack_documents';
const MANIFEST = process.env.MANIFEST || './photos_manifest.jsonl';
const OUT = process.env.OUT || './photos_uploaded.jsonl';
const CONCURRENCY = Number(process.env.CONCURRENCY || 4);
// Default budget leaves headroom under a 1 GB quota rather than filling it exactly.
const MAX_BYTES = Number(process.env.MAX_BYTES || 850_000_000);
const SINCE = process.env.SINCE || '';
const DRY_RUN = process.env.DRY_RUN === 'true';

for (const [k, v] of Object.entries({ SRC_DIR, TGT_URL, TGT_KEY, TENANT }))
  if (!v) throw new Error(`Missing env ${k}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchRetry(url, opts, tries = 5) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.ok) return res;
      last = new Error(`HTTP ${res.status}`);
      if (res.status !== 429 && res.status < 500) return res;
    } catch (e) {
      last = e;
    }
    await sleep(400 * 2 ** i + Math.floor(Math.random() * 250));
  }
  throw last ?? new Error('fetch failed');
}

const all = readFileSync(MANIFEST, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l));

let done = new Set();
try {
  done = new Set(
    readFileSync(OUT, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l).id),
  );
} catch {
  if (!DRY_RUN) writeFileSync(OUT, '');
}

// Select within the budget up front, so a dry run reports exactly what a real run would do.
const selected = [];
let planned = 0,
  skippedOld = 0,
  skippedBudget = 0,
  missingFile = 0;

for (const p of all) {
  if (done.has(p.id)) continue;
  if (SINCE && String(p.uploaded_at).slice(0, 10) < SINCE) {
    skippedOld++;
    continue;
  }
  // Defence in depth: the same tenant-prefix invariant the storage classes enforce, held at the
  // import boundary too, so a malformed manifest can never write outside the tenant's prefix.
  if (!String(p.storage_path).startsWith(`${TENANT}/`)) {
    throw new Error(`refusing ref outside tenant prefix: ${p.storage_path}`);
  }
  let size;
  try {
    size = statSync(join(SRC_DIR, p.storage_path)).size;
  } catch {
    missingFile++;
    continue;
  }
  if (planned + size > MAX_BYTES) {
    skippedBudget++;
    continue;
  }
  planned += size;
  selected.push({ ...p, size });
}

const mb = (n) => (n / 1048576).toFixed(1);
console.log(
  `manifest ${all.length}, already uploaded ${done.size}, ` +
    `older than ${SINCE || '(no cutoff)'} ${skippedOld}, over budget ${skippedBudget}, ` +
    `missing on disk ${missingFile}`,
);
console.log(
  `${DRY_RUN ? 'would upload' : 'uploading'} ${selected.length} files, ${mb(planned)} MB`,
);
if (missingFile) console.log(`  ⚠ ${missingFile} manifest rows have no bytes on disk`);
if (DRY_RUN) process.exit(0);

let ok = 0,
  fail = 0,
  n = 0,
  idx = 0,
  bytesTotal = 0;
const failures = [];

async function worker() {
  while (idx < selected.length) {
    const p = selected[idx++];
    try {
      const buf = await readFile(join(SRC_DIR, p.storage_path));
      const path = p.storage_path.split('/').map(encodeURIComponent).join('/');
      const res = await fetchRetry(`${TGT_URL}/storage/v1/object/${BUCKET}/${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TGT_KEY}`,
          apikey: TGT_KEY,
          'Content-Type': p.content_type || 'image/jpeg',
          'x-upsert': 'true',
        },
        body: new Uint8Array(buf),
      });
      if (!res.ok) throw new Error(`upload ${res.status}: ${await res.text()}`);
      bytesTotal += buf.length;
      appendFileSync(
        OUT,
        JSON.stringify({
          id: p.id,
          storage_path: p.storage_path,
          bytes: buf.length,
          content_type: p.content_type || 'image/jpeg',
          uploaded_at: p.uploaded_at,
        }) + '\n',
      );
      ok++;
    } catch (e) {
      fail++;
      failures.push({ id: p.id, err: String(e.message || e) });
    } finally {
      if (++n % 100 === 0)
        console.log(`  ${n}/${selected.length} (ok ${ok}, fail ${fail}, ${mb(bytesTotal)} MB)`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`DONE: ok ${ok}, fail ${fail}, ${mb(bytesTotal)} MB into ${BUCKET}`);
if (failures.length) console.log('first failures:', JSON.stringify(failures.slice(0, 10), null, 2));

// Non-zero on any failure so a caller with `set -e` stops rather than assuming a complete upload.
process.exitCode = failures.length ? 1 : 0;
