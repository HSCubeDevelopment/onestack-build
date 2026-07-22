// Copy every fleet photo from the legacy In N Out private Storage bucket into OneStack's private Storage
// (migration plan §10). Companion to import-innout-fleet.sql, which imported the photo *rows*' parent
// vehicles/movements/returns. This moves the actual image BYTES.
//
// Deterministic target path (<tenant>/<sourcePhotoId>) + x-upsert => fully idempotent / resumable, and
// it records each success to a JSONL so import-innout-photos.sql can then create the onestack_fleet_photo
// rows. Low concurrency + retry/backoff to stay under Supabase Storage's rate limits.
//
// No credentials in this file — pass them via env:
//   SRC_URL   legacy project URL          (https://<ref>.supabase.co)
//   SRC_KEY   legacy service-role key     (to read the private 'photos' bucket)
//   TGT_URL   OneStack SUPABASE_URL
//   TGT_KEY   OneStack SUPABASE_SERVICE_ROLE_KEY
//   BUCKET    OneStack bucket             (default onestack_documents)
//   TENANT    the shop's tenant id
//   PHOTOS    path to photos.jsonl        (one {id,storage_path,vehicle_id,movement_id,return_id,
//                                           booking_id,photo_type,notes,uploaded_at} per line, exported
//                                           from the source `photos` table)
//   OUT       path to write successes     (default ./photos_done.jsonl)
//
// First real run (22 Jul 2026): 614/614 photos copied, 0 failures.
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';

const { SRC_URL, SRC_KEY, TGT_URL, TGT_KEY, TENANT } = process.env;
const BUCKET = process.env.BUCKET || 'onestack_documents';
const PHOTOS = process.env.PHOTOS || './photos.jsonl';
const OUT = process.env.OUT || './photos_done.jsonl';
const CONCURRENCY = Number(process.env.CONCURRENCY || 4);
for (const [k, v] of Object.entries({ SRC_URL, SRC_KEY, TGT_URL, TGT_KEY, TENANT }))
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
  idx = 0;
const failures = [];
async function worker() {
  while (idx < rows.length) {
    const p = rows[idx++];
    try {
      const srcPath = p.storage_path.split('/').map(encodeURIComponent).join('/');
      const dl = await fetchRetry(`${SRC_URL}/storage/v1/object/photos/${srcPath}`, {
        headers: { Authorization: `Bearer ${SRC_KEY}`, apikey: SRC_KEY },
      });
      if (!dl.ok) throw new Error(`download ${dl.status}`);
      const buf = Buffer.from(await dl.arrayBuffer());
      const ct = dl.headers.get('content-type') || 'image/jpeg';
      const path = `${TENANT}/${p.id}`;
      const up = await fetchRetry(`${TGT_URL}/storage/v1/object/${BUCKET}/${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TGT_KEY}`,
          apikey: TGT_KEY,
          'Content-Type': ct,
          'x-upsert': 'true',
        },
        body: new Uint8Array(buf),
      });
      if (!up.ok) throw new Error(`upload ${up.status}`);
      appendFileSync(
        OUT,
        JSON.stringify({
          id: p.id,
          vehicle_id: p.vehicle_id,
          movement_id: p.movement_id,
          return_id: p.return_id,
          booking_id: p.booking_id,
          photo_type: p.photo_type,
          storage_path: path,
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
      if (++n % 50 === 0) console.log(`  ${n}/${rows.length} (ok ${ok}, fail ${fail})`);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`DONE: ok ${ok}, fail ${fail}`);
if (failures.length) console.log('failures:', JSON.stringify(failures.slice(0, 10)));
