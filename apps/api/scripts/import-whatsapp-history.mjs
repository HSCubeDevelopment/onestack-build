// Import the parsed WhatsApp service history into OneStack.
//
//   node scripts/import-whatsapp-history.mjs <export-dir> [--limit N] [--dry] [--api URL]
//
// Run scripts/parse-whatsapp-export.mjs first — this reads the whatsapp.jsonl it writes.
//
// WHY IT DRIVES THE API RATHER THAN WRITING ROWS. `POST /vehicle-profile/draft` already knows the pack
// schema (make/model/year required), reuses an existing car by exact rego, backfills make and model
// from the fleet table, and picks or creates the open job. The attachment endpoint already validates
// content type, caps size, and writes to Supabase Storage. Reimplementing any of that in SQL is how an
// import ends up subtly different from what the app produces.
//
// Nothing here backdates anything — the API always stamps `now()`. scripts/backdate-whatsapp-import.sql
// is the second pass that puts the real dates on.
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const dir = resolve(args.find((a) => !a.startsWith('--')) ?? '.');
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d;
};
const has = (n) => args.includes(`--${n}`);

const API = flag('api', process.env.ONESTACK_API_BASE ?? 'http://localhost:3001/api/v1').replace(
  /\/$/,
  '',
);
const TOKEN = process.env.ONESTACK_TOKEN ?? '';
const LIMIT = Number(flag('limit', '0')) || Infinity;
const DRY = has('dry');
const CONCURRENCY = Number(process.env.CONCURRENCY ?? '3');

if (!TOKEN && !DRY) {
  console.error(
    'ONESTACK_TOKEN is not set. It must be an OWNER session token — the import attributes every\n' +
      'note and photo to that user, and needs to see every car.',
  );
  process.exit(1);
}

const jsonl = join(dir, 'whatsapp.jsonl');
if (!existsSync(jsonl)) {
  console.error(`No whatsapp.jsonl in ${dir}. Run scripts/parse-whatsapp-export.mjs first.`);
  process.exit(1);
}

/** The line that marks a note as imported. Also the idempotency key — see skipNote below. */
const MARKER = 'Imported from the workshop WhatsApp group';

/** Restrict to named registrations — for the trial run and for checking one car by hand. */
const ONLY = new Set(
  (flag('only', '') || '')
    .split(',')
    .map((r) => r.trim().toUpperCase())
    .filter(Boolean),
);

const visits = readFileSync(jsonl, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l))
  // Nothing to say and nothing to show — importing an empty note helps no one.
  .filter((v) => v.work.length || v.photos.some((p) => p.present))
  .filter((v) => ONLY.size === 0 || ONLY.has(v.rego))
  .slice(0, LIMIT === Infinity ? undefined : LIMIT);

const onDisk = new Set(readdirSync(dir));

/** Append-only ledger, read back at startup, so an interrupted run resumes instead of restarting. */
const LEDGER = join(dir, 'whatsapp-imported.jsonl');
const done = new Set();
if (existsSync(LEDGER)) {
  for (const line of readFileSync(LEDGER, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      done.add(JSON.parse(line).visitKey);
    } catch {
      /* a torn final line from a killed run */
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** HTTP with backoff on the statuses that mean "try again", and a useful error on the rest. */
async function call(method, path, body, tries = 5) {
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(`${API}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${TOKEN}`,
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      if (attempt >= tries) throw new Error(`${method} ${path}: ${e.message}`);
      await sleep(2 ** attempt * 250);
      continue;
    }
    if (res.ok) return res.status === 204 ? null : res.json();
    if ((res.status === 429 || res.status >= 500) && attempt < tries) {
      await sleep(2 ** attempt * 500);
      continue;
    }
    throw new Error(`${method} ${path} -> ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
}

const visitKey = (v) =>
  createHash('sha1').update(`whatsapp:${v.rego}:${v.at}`).digest('hex').slice(0, 12);

/** The note body: provenance line, then the work exactly as it was written in the group. */
function noteBody(v) {
  const when = new Date(v.at).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const lines = [`${MARKER} · ${when} · ref ${visitKey(v)}`];
  if (v.work.length) lines.push(...v.work);
  else lines.push('(no description was written — photos only)');
  if (v.customer?.name || v.customer?.phone)
    lines.push(`Customer: ${[v.customer.name, v.customer.phone].filter(Boolean).join(' ')}`);
  return lines.join('\n');
}

let created = { cars: 0, photos: 0, notes: 0, skipped: 0 };
const failures = [];

async function importVisit(v) {
  const key = visitKey(v);
  if (done.has(key)) {
    created.skipped += 1;
    return;
  }

  const usable = v.photos.filter((p) => p.present && onDisk.has(p.file));

  if (DRY) {
    console.log(
      `  [dry] ${v.rego} ${v.at.slice(0, 10)}  work=${v.work.length}  photos=${usable.length}` +
        (v.customer ? `  customer=${v.customer.name ?? v.customer.phone}` : ''),
    );
    return;
  }

  // 1. The car, its contact and its job. Idempotent on exact rego.
  const draft = await call('POST', '/vehicle-profile/draft', { rego: v.rego });
  const jobId = draft.jobId;
  created.cars += 1;

  // 2. Photos. The WhatsApp filename is unique within the export and is what makes a re-run safe —
  //    these images have no id of their own.
  const existing = await call('GET', `/work-items/${jobId}/attachments`);
  const already = new Set((existing ?? []).map((a) => a.fileName));
  for (const p of usable) {
    if (already.has(p.file)) continue;
    const bytes = readFileSync(join(dir, p.file));
    await call('POST', `/work-items/${jobId}/attachments`, {
      fileName: p.file,
      contentType: p.file.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg',
      dataBase64: bytes.toString('base64'),
      caption: 'Service photo',
    });
    created.photos += 1;
  }

  // 3. The work list. Keyed on the visit ref in the marker line, so the same visit is never
  //    written twice even if the ledger is lost.
  const notes = await call('GET', `/work-items/${jobId}/notes`);
  const hasNote = (notes ?? []).some((n) => (n.body ?? '').includes(`ref ${key}`));
  if (!hasNote) {
    await call('POST', `/work-items/${jobId}/notes`, { body: noteBody(v) });
    created.notes += 1;
  }

  appendFileSync(LEDGER, JSON.stringify({ visitKey: key, rego: v.rego, at: v.at, jobId }) + '\n');
}

/** A small worker pool — the API is doing image writes, so this is deliberately not wide. */
async function run() {
  console.log(`${DRY ? 'DRY RUN — ' : ''}importing ${visits.length} visits from ${dir}`);
  console.log(`  api        ${API}`);
  console.log(`  already done ${done.size} (ledger)`);
  console.log('');

  const queue = [...visits];
  const workers = Array.from({ length: DRY ? 1 : CONCURRENCY }, async () => {
    for (;;) {
      const v = queue.shift();
      if (!v) return;
      try {
        await importVisit(v);
        const n = visits.length - queue.length;
        if (!DRY && n % 25 === 0) {
          console.log(
            `  ${n}/${visits.length}  cars=${created.cars} photos=${created.photos} notes=${created.notes} skipped=${created.skipped}`,
          );
        }
      } catch (e) {
        failures.push({ rego: v.rego, at: v.at, error: e.message });
        console.error(`  FAILED ${v.rego} ${v.at.slice(0, 10)}: ${e.message}`);
      }
    }
  });
  await Promise.all(workers);

  console.log('');
  console.log(`  visits processed ${visits.length}`);
  console.log(`  photos added     ${created.photos}`);
  console.log(`  notes added      ${created.notes}`);
  console.log(`  visits skipped   ${created.skipped} (already imported)`);
  if (failures.length) {
    console.error(`\n  ${failures.length} FAILED:`);
    for (const f of failures.slice(0, 20))
      console.error(`    ${f.rego} ${f.at.slice(0, 10)} — ${f.error}`);
    process.exit(1);
  }
  if (!DRY) console.log('\nNow run scripts/backdate-whatsapp-import.sql to put the real dates on.');
}

await run();
