// Convert the photo-download ledger (photos_done.jsonl) into the CSV import-innout-photos.sql loads.
// The ledger records only SUCCESSFUL downloads, so a photo row is never created for bytes that are
// not on disk.
//
// Usage: node innout-photos-jsonl-to-csv.mjs <photos_done.jsonl> <photos_load.csv>
//
// Output is customer-adjacent data (notes) and is gitignored — keep it in the work directory.
import { createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('usage: innout-photos-jsonl-to-csv.mjs <in.jsonl> <out.csv>');
  process.exit(2);
}

// Column order must match the \copy target list in import-innout-photos.sql.
const COLS = [
  'id',
  'vehicle_id',
  'movement_id',
  'return_id',
  'booking_id',
  'photo_type',
  'storage_path',
  'content_type',
  'notes',
  'uploaded_at',
];

/** RFC-4180: quote when the value contains a comma, quote or newline; double any embedded quote. */
function cell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

const rows = [COLS.join(',')];
let n = 0;
for await (const line of createInterface({
  input: createReadStream(inPath),
  crlfDelay: Infinity,
})) {
  if (!line.trim()) continue;
  const r = JSON.parse(line);
  rows.push(COLS.map((c) => cell(r[c])).join(','));
  n++;
}

writeFileSync(outPath, rows.join('\n') + '\n');
console.log(`${outPath}: ${n} rows`);
