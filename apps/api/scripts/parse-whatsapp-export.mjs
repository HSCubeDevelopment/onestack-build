// Parse a WhatsApp group export into one record per car. READ ONLY — writes two files, touches no
// database and no storage.
//
//   node scripts/parse-whatsapp-export.mjs <export-dir> [--out <dir>] [--window 90]
//
// <export-dir> is the unzipped export: `_chat.txt` plus the media files beside it.
//
// WHY A SEPARATE DRY-RUN STEP. The whole import rests on an inference — a photo belongs to the last
// registration someone typed — and that inference cannot be checked after 1,318 photos are attached to
// 355 cars. So this step states what it would do, in numbers you can compare against the chat, and
// prints everything it could NOT place rather than quietly dropping it. Read the report before running
// the importer.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const dir = resolve(args.find((a) => !a.startsWith('--')) ?? '.');
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const OUT = resolve(flag('out', dir));
/** A bare photo this long after the last registration is not safely attributable to it. */
const WINDOW_MIN = Number(flag('window', '90'));

const chatPath = join(dir, '_chat.txt');
if (!existsSync(chatPath)) {
  console.error(`No _chat.txt in ${dir}. Unzip the WhatsApp export and point at that folder.`);
  process.exit(1);
}

// WhatsApp wraps lines in direction marks and uses a narrow no-break space before am/pm.
const raw = readFileSync(chatPath, 'utf8').replace(/‎|‏/g, '').replace(/ /g, ' ');
const LINE = /^\[(\d{1,2})\/(\d{1,2})\/(\d{4}), (\d{1,2}):(\d{2}):(\d{2})\] ([^:]+): ?(.*)$/;
const ATTACHED = /<attached: ([^>]+)>/g;
const OMITTED = /\b(image|video|document|audio|sticker) omitted\b/i;
/** 5–7 alphanumerics containing at least one letter AND one digit — an Australian plate. */
const REGO = /\b(?=[A-Z0-9]{5,7}\b)(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{5,7}\b/g;
/** Same shape, case-insensitive — the group types plates both ways ('2AG1JK' and '2ag1jk'). */
const REGO_ANY =
  /\b(?=[A-Za-z0-9]{5,7}\b)(?=[A-Za-z0-9]*\d)(?=[A-Za-z0-9]*[A-Za-z])[A-Za-z0-9]{5,7}\b/g;
/** Words that look like plates but are filename fragments or units. */
const NOT_A_REGO = new Set(['PHOTO', 'VIDEO', 'IMAGE', 'AUDIO', 'STICKER', 'OMITTED']);
/** A mobile number, or a run of digits long enough to be one. */
const PHONE = /(\+?61\s?4\d{2}|\b0[45]\d{2})[\s-]?\d{3}[\s-]?\d{3}\b|\b\d{8,}\b/;

/** Physical lines -> messages. A message continues until the next timestamped line. */
function parseMessages(text) {
  const out = [];
  for (const ln of text.split('\n')) {
    const line = ln.replace(/\r$/, '');
    const m = LINE.exec(line);
    if (m) {
      const [, d, mo, y, H, M, S, who, body] = m;
      // The export is D/M/YYYY (an 8/7 message sits between 7/7 and 9/7 in the file).
      out.push({
        at: new Date(Number(y), Number(mo) - 1, Number(d), Number(H), Number(M), Number(S)),
        who: who.trim(),
        body,
      });
    } else if (out.length) {
      out[out.length - 1].body += `\n${line}`;
    }
  }
  return out;
}

/** The registrations named in a message, ignoring the attachment filenames. */
function regosIn(body) {
  const text = body.replace(ATTACHED, ' ').toUpperCase();
  return [...new Set(text.match(REGO) ?? [])].filter((r) => !NOT_A_REGO.has(r));
}

/**
 * Words that make a line a job, whatever else it looks like.
 *
 * Needed because "Service" and "Hamza Islam" are the same shape — one capitalised word or two — so a
 * name detector alone would swallow half the work list. A line mentioning any of these is work, full
 * stop. Drawn from the group's own vocabulary (service 182, engine service 166, tyre rotation 108…).
 */
const WORK_WORDS =
  /\b(service|tyre|tire|filter|brake|pad|wiper|blade|battery|alignment|rotat|punctur|engine|transmission|oil|plug|belt|coolant|wash|repair|replac|new|fluid|hybrid|cabin|fuel|air|rear|front|check|fix|clean|balance|rotor|disc|globe|light|hose|leak|top up)\b/i;

/** One to three capitalised words and nothing else — a person's name, not a job. */
const NAME_SHAPE = /^[A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+){0,2}$/;

const looksLikeName = (line) => NAME_SHAPE.test(line) && !WORK_WORDS.test(line);

/**
 * Split a message into work lines and a customer.
 *
 * The group's habit is: plate, then the jobs, then the owner's name and number. So the number marks
 * the contact, and the NAME is on that line or the one directly above it — not every line in the
 * message. Blanket-skipping a message because it contains a number threw away real work: 2CJ5ZU's
 * "One new tyre" vanished along with "Hamza Islam".
 */
function splitBody(body) {
  const text = body.replace(ATTACHED, ' ').replace(/\b\w+ omitted\b/gi, ' ');
  const cleaned = text.split('\n').map((l) =>
    l
      .replace(REGO_ANY, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[.,\-–]+|[.,\-–]+$/g, ''),
  );

  const work = [];
  let customer = null;
  const usedAsName = new Set();

  cleaned.forEach((line, i) => {
    if (!line) return;
    const phone = PHONE.exec(line);
    if (!phone) return;
    const digits = phone[0].replace(/\D/g, '');
    if (digits.length < 8) return;
    // The name sits beside the number, or on the line directly above it.
    let name = line.replace(phone[0], '').replace(/[/|,]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!name && i > 0 && looksLikeName(cleaned[i - 1])) {
      name = cleaned[i - 1];
      usedAsName.add(i - 1);
    }
    usedAsName.add(i);
    if (!customer) customer = { name: name || null, phone: phone[0].trim() };
  });

  cleaned.forEach((line, i) => {
    if (!line || usedAsName.has(i)) return;
    if (line.length > 80) return; // a paragraph is not a work item
    // WhatsApp renders a document as "invoice.pdf • 1 page". That is the attachment describing
    // itself, not a job — and it is the only thing keeping some PDF-only messages alive as "visits".
    if (/\.(pdf|jpe?g|png|mp4|docx?|xlsx?)\b/i.test(line) || /•\s*\d+\s*pages?/i.test(line)) return;
    // A bare name with no number attached is still not a job. One word is enough — "James" is a
    // person, "Service" and "Hybrid" are jobs, and WORK_WORDS is what tells them apart.
    if (looksLikeName(line)) return;
    work.push(line);
  });

  return { work, customer };
}

const messages = parseMessages(raw);

/*
 * One record per VISIT, not per car.
 *
 * 2AG1JK was serviced on 8 July, 14 August and 18 September. Collapsing a registration into a single
 * record merged three separate services into one unreadable list ("Service, Tyre rotation, Hybrid
 * filter, Cabin filter, Hybrid, 2 new tyre") and threw away the dates — which are the thing that makes
 * a service history worth having. A new naming message starts a new visit unless that car was already
 * in hand within the window.
 */
const visits = [];
const unattributed = [];
let attachmentRefs = 0;
let current = null; // the visit in hand: { visit, at }

for (const msg of messages) {
  const files = [...msg.body.matchAll(ATTACHED)].map((m) => m[1]);
  attachmentRefs += files.length;
  const omitted = OMITTED.test(msg.body);
  const named = regosIn(msg.body);

  if (named.length) {
    const rego = named[0];
    const stillInHand =
      current &&
      current.visit.rego === rego &&
      (msg.at.getTime() - current.at.getTime()) / 60000 <= WINDOW_MIN;

    if (!stillInHand) {
      const visit = {
        rego,
        at: msg.at.toISOString(),
        work: [],
        customer: null,
        photos: [],
        omittedCount: 0,
        alsoNamed: named.slice(1),
      };
      visits.push(visit);
      current = { visit, at: msg.at };
    } else {
      current.at = msg.at;
    }

    const { work, customer } = splitBody(msg.body);
    for (const w of work) if (!current.visit.work.includes(w)) current.visit.work.push(w);
    if (customer && !current.visit.customer) current.visit.customer = customer;
  }

  if (!files.length && !omitted) {
    // A bare message with no rego can still carry the customer for the visit in hand — the group
    // habit is to post the plate, then the owner's name and number underneath.
    if (current && !named.length) {
      const { customer } = splitBody(msg.body);
      if (customer && !current.visit.customer) current.visit.customer = customer;
    }
    continue;
  }

  const withinWindow = current && (msg.at.getTime() - current.at.getTime()) / 60000 <= WINDOW_MIN;
  if (withinWindow) {
    for (const f of files) current.visit.photos.push({ file: f, at: msg.at.toISOString() });
    if (omitted && !files.length) current.visit.omittedCount += 1;
    current.at = msg.at; // a run of photos keeps the visit in hand
  } else {
    for (const f of files)
      unattributed.push({
        file: f,
        at: msg.at.toISOString(),
        reason: 'no registration within window',
      });
    if (omitted && !files.length)
      unattributed.push({
        file: null,
        at: msg.at.toISOString(),
        reason: 'media not included in the export',
      });
  }
}

// Which referenced files are actually present on disk — an export can name media it did not ship.
const onDisk = new Set(readdirSync(dir));
let missingBytes = 0;
for (const v of visits) {
  for (const p of v.photos) {
    p.present = onDisk.has(p.file);
    if (!p.present) missingBytes += 1;
  }
}

const records = visits.map((v) => ({
  ...v,
  // Stable across re-runs: same rego, same moment, same key. This is what stops a second run
  // duplicating 354 notes, since WhatsApp gives attachments no id of their own.
  noteKey: createHash('sha1').update(`whatsapp:${v.rego}:${v.at}`).digest('hex').slice(0, 12),
}));

const jsonlPath = join(OUT, 'whatsapp.jsonl');
writeFileSync(jsonlPath, records.map((r) => JSON.stringify(r)).join('\n') + '\n');

/*
 * Date maps for the backdating pass.
 *
 * The API stamps now() on everything it writes and offers no way to say otherwise — notes are
 * deliberately append-only. So the real dates go on afterwards, in SQL, matched on the two keys that
 * survive the import: the visit ref embedded in the note, and the WhatsApp filename on the photo.
 *
 * This matters for more than tidiness. Attachments produce no timeline events — only notes do — so the
 * backdated note is the thing that puts "8 Jul 2026 · Service, Tyre rotation" in a car's history.
 */
writeFileSync(
  join(OUT, 'whatsapp-note-dates.csv'),
  'ref,at\n' + records.map((r) => `${r.noteKey},${r.at}`).join('\n') + '\n',
);
writeFileSync(
  join(OUT, 'whatsapp-photo-dates.csv'),
  'file_name,at\n' +
    records
      .flatMap((r) => r.photos.filter((p) => p.present).map((p) => `${p.file},${p.at}`))
      .join('\n') +
    '\n',
);

const attributed = records.reduce((n, c) => n + c.photos.length, 0);
const importable = records.reduce((n, c) => n + c.photos.filter((p) => p.present).length, 0);
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
/** The shop's local calendar date, not the UTC one — a 9am AEST message is the day before in UTC. */
const localDay = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const lines = [];
const say = (s = '') => {
  lines.push(s);
  console.log(s);
};

say(`WhatsApp export: ${dir}`);
say(`  messages parsed        ${messages.length}`);
say(`  attachment references  ${attachmentRefs}`);
say('');
const distinctRegos = new Set(records.map((r) => r.rego)).size;
say(`  distinct registrations ${distinctRegos}`);
say(`  service visits         ${records.length}   <- one note each, one per date`);
say(
  `  photos attributed      ${attributed} / ${attachmentRefs}  (${pct(attributed, attachmentRefs)}%)`,
);
say(`  ...with bytes on disk  ${importable}  <- what would actually import`);
say(`  visits with work text  ${records.filter((c) => c.work.length).length}`);
say(`  visits with a customer ${records.filter((c) => c.customer).length}`);
say('');
say(`  NOT importable:`);
say(`    media with no registration within ${WINDOW_MIN} min   ${unattributed.length}`);
say(`    attributed but bytes missing from the export        ${missingBytes}`);

const noWork = records.filter((c) => !c.work.length);
if (noWork.length) {
  say('');
  say(`  visits with NO work text (${noWork.length}) — photos only, note says so:`);
  for (const c of noWork.slice(0, 15))
    say(`    ${c.rego}  ${localDay(c.at)}  photos=${c.photos.length}`);
  if (noWork.length > 15) say(`    ... and ${noWork.length - 15} more`);
}

if (unattributed.length) {
  say('');
  say(`  unattributed media (first 20 of ${unattributed.length}):`);
  for (const u of unattributed.slice(0, 20))
    say(`    ${localDay(u.at)}  ${u.file ?? '(not in export)'}  — ${u.reason}`);
}

say('');
say(`  wrote ${jsonlPath}`);

const reportPath = join(OUT, 'whatsapp-report.txt');
writeFileSync(reportPath, lines.join('\n') + '\n');
writeFileSync(join(OUT, 'whatsapp-unattributed.json'), JSON.stringify(unattributed, null, 1));
console.log(`  wrote ${reportPath}`);
console.log(`  wrote ${join(OUT, 'whatsapp-unattributed.json')}`);
console.log('\nNothing was written to the database. Read the numbers above before importing.');
