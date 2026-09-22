/**
 * Service history — the shop's servicing record for one car, as a structured thing rather than prose.
 *
 * WHERE IT COMES FROM. Two years of servicing were backfilled out of the mechanics' WhatsApp group,
 * and each visit was written as a job note in a fixed, machine-written shape:
 *
 *     Imported from the workshop WhatsApp group · 9 July 2026 · ref a1b2c3d4e5f6
 *     service
 *     Tyre rotation
 *     Oil in Engine bay
 *     Customer: Angelo 0420233477
 *
 * Parsing that back is safe precisely because nothing human wrote it — the importer emits exactly this
 * format, and the tests below pin it. Doing it this way keeps the note as the audit record (append-only,
 * with its author and its provenance intact) while letting the app present a clean screen instead of a
 * wall of imported text.
 *
 * Notes written by a person are NOT service records and never appear here.
 */

/** The line every imported service note opens with. Also how they are recognised. */
export const IMPORT_MARKER = 'Imported from the workshop WhatsApp group';

export interface ServiceRecord {
  /** Stable id for this visit — the `ref` from the marker line. */
  ref: string;
  /** When the work was done (the note's own date, backdated to the original message). */
  at: string;
  /** One line per job, as the mechanic wrote it. */
  work: string[];
  customer: { name: string | null; phone: string | null } | null;
  /** Photos taken at that visit — matched by time, see attachPhotos. */
  photos: { id: string; fileName: string; at: string }[];
}

/** True when a note body is one of the imported service records. */
export function isServiceNote(body: string): boolean {
  return body.startsWith(IMPORT_MARKER);
}

export interface RawNote {
  body: string;
  createdAt: Date;
}

/**
 * Turn one imported note into a structured record. Returns null for anything that is not one — a
 * person's note about a repair must never be mistaken for a service entry.
 */
export function parseServiceNote(note: RawNote): ServiceRecord | null {
  if (!isServiceNote(note.body)) return null;
  const [header, ...rest] = note.body.split('\n');

  // Alphanumeric rather than hex: the importer emits a sha1 slice today, and a ref that stops being
  // hex one day should not silently turn every record's id into an empty string.
  const ref = /·\s*ref\s+([A-Za-z0-9_-]+)/.exec(header ?? '')?.[1] ?? '';

  const work: string[] = [];
  let customer: ServiceRecord['customer'] = null;

  for (const line of rest) {
    const s = line.trim();
    if (!s) continue;
    const cust = /^Customer:\s*(.*)$/i.exec(s);
    if (cust) {
      const value = (cust[1] ?? '').trim();
      // "Angelo 0420233477" | "0420233477" | "Angelo"
      const phone = /(\+?\d[\d\s-]{6,})$/.exec(value)?.[1]?.trim() ?? null;
      const name = (phone ? value.slice(0, value.length - phone.length) : value).trim();
      customer = { name: name || null, phone };
      continue;
    }
    // The importer writes this when the group posted photos with no description.
    if (s.startsWith('(no description')) continue;
    work.push(s);
  }

  return { ref, at: note.createdAt.toISOString(), work, customer, photos: [] };
}

export interface RawPhoto {
  id: string;
  fileName: string;
  caption: string | null;
  createdAt: Date;
}

/** The caption the importer and the mechanic screen store service photos under. */
export const SERVICE_PHOTO_CAPTIONS = ['Service photo', 'Before service', 'After service'];

/**
 * Attach each service photo to the visit it was taken at.
 *
 * Photos carry no link to a visit — every one of a car's photos hangs off the same job — so the join
 * is by time, which works because both sides were backdated to the original WhatsApp timestamps and a
 * visit's photos are posted within minutes of its description.
 *
 * A photo goes to the NEAREST visit, and only if it is within `windowMinutes`. Anything further out is
 * left off rather than guessed onto the closest record, which would silently attach one car's photos to
 * a service six weeks away.
 */
export function attachPhotos(
  records: ServiceRecord[],
  photos: RawPhoto[],
  windowMinutes = 180,
): ServiceRecord[] {
  if (records.length === 0) return records;
  const byRef = new Map(records.map((r) => [r.ref, r]));

  for (const p of photos) {
    if (!SERVICE_PHOTO_CAPTIONS.includes(p.caption ?? '')) continue;
    let best: { ref: string; delta: number } | null = null;
    for (const r of records) {
      const delta = Math.abs(new Date(r.at).getTime() - p.createdAt.getTime());
      if (!best || delta < best.delta) best = { ref: r.ref, delta };
    }
    if (!best || best.delta > windowMinutes * 60_000) continue;
    byRef.get(best.ref)?.photos.push({
      id: p.id,
      fileName: p.fileName,
      at: p.createdAt.toISOString(),
    });
  }

  for (const r of records) r.photos.sort((a, b) => a.at.localeCompare(b.at));
  return records;
}

/** The car's servicing, newest first, with photos attached. */
export function buildServiceHistory(notes: RawNote[], photos: RawPhoto[]): ServiceRecord[] {
  const records = notes
    .map(parseServiceNote)
    .filter((r): r is ServiceRecord => r !== null)
    .sort((a, b) => b.at.localeCompare(a.at));
  return attachPhotos(records, photos);
}
