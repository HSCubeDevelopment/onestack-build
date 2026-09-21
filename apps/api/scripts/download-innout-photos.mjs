// Copy legacy In N Out photo bytes from its private Supabase bucket onto local disk, laid out the way
// FilesystemFleetPhotoStorage expects: <FLEET_PHOTO_DIR>/<tenant>/<sourcePhotoId>.
//
// Local-disk counterpart of the repo's import-innout-photos.mjs (which goes Supabase -> Supabase).
// Resumable: successes are appended to photos_done.jsonl and skipped on a re-run.
//
// env: SRC_URL, SRC_KEY, TENANT, DEST (the FLEET_PHOTO_DIR root), PHOTOS, OUT
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const { SRC_URL, SRC_KEY, TENANT, DEST } = process.env;
const PHOTOS = process.env.PHOTOS || './photos.jsonl';
const OUT = process.env.OUT || './photos_done.jsonl';
const CONCURRENCY = Number(process.env.CONCURRENCY || 6);
const BUCKET = process.env.BUCKET || 'photos';
for (const [k, v] of Object.entries({ SRC_URL, SRC_KEY, TENANT, DEST }))
  if (!v) throw new Error(`Missing env ${k}`);

const tenantDir = join(DEST, TENANT);
mkdirSync(tenantDir, { recursive: true });

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

const all = readFileSync(PHOTOS, 'utf8')
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
  writeFileSync(OUT, '');
}

const rows = all.filter((p) => p.storage_path && !done.has(p.id));
console.log(`Total ${all.length}, already done ${done.size}, remaining ${rows.length}`);

let ok = 0,
  fail = 0,
  n = 0,
  idx = 0,
  bytesTotal = 0;
const failures = [];

async function worker() {
  while (idx < rows.length) {
    const p = rows[idx++];
    try {
      const srcPath = p.storage_path.split('/').map(encodeURIComponent).join('/');
      const dl = await fetchRetry(`${SRC_URL}/storage/v1/object/${BUCKET}/${srcPath}`, {
        headers: { Authorization: `Bearer ${SRC_KEY}`, apikey: SRC_KEY },
      });
      if (!dl.ok) throw new Error(`download ${dl.status}`);
      const buf = Buffer.from(await dl.arrayBuffer());
      const ct = dl.headers.get('content-type') || 'image/jpeg';
      await writeFile(join(tenantDir, p.id), buf);
      bytesTotal += buf.length;
      appendFileSync(
        OUT,
        JSON.stringify({
          id: p.id,
          vehicle_id: p.vehicle_id,
          movement_id: p.movement_id,
          return_id: p.return_id,
          booking_id: p.booking_id,
          photo_type: p.photo_type,
          storage_path: `${TENANT}/${p.id}`,
          content_type: ct,
          notes: p.notes ?? '',
          uploaded_at: p.uploaded_at,
        }) + '\n',
      );
      ok++;
    } catch (e) {
      fail++;
      failures.push({ id: p.id, err: String(e.message || e) });
    } finally {
      if (++n % 250 === 0)
        console.log(
          `  ${n}/${rows.length} (ok ${ok}, fail ${fail}, ${(bytesTotal / 1048576) | 0} MB)`,
        );
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(
  `DONE: ok ${ok}, fail ${fail}, ${(bytesTotal / 1048576) | 0} MB written to ${tenantDir}`,
);
if (failures.length) console.log('first failures:', JSON.stringify(failures.slice(0, 10), null, 2));

// Exit non-zero on any failure so refresh-innout.sh (set -e) stops rather than importing photo rows
// whose bytes never landed. Re-running resumes from the ledger, so a partial run is cheap to finish.
process.exitCode = failures.length ? 1 : 0;
