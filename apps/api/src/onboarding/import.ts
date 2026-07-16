/**
 * Onboarding & data migration — pure logic (Phase 3, card #152). GENERIC core. Parses + validates a CSV
 * of customers before they're imported, so the owner gets a per-row preview (a DRAFT they confirm) rather
 * than a silent bulk write. No I/O here. A real migration is a human-confirmed, reviewable step — never
 * automatic.
 */

/** Hard cap on rows per import (abuse + accidental-huge-paste guard). */
export const MAX_IMPORT_ROWS = 1000;

export interface ContactRow {
  displayName: string;
  phone: string;
  email?: string;
}

export interface RowResult {
  row: number; // 1-based, matching the source line
  status: 'ok' | 'error' | 'duplicate';
  message?: string;
  value?: ContactRow;
}

/**
 * Parse a simple CSV: a header line naming the columns (displayName/name, phone, email in any order),
 * then one contact per line. Quoted fields and embedded commas are NOT supported — this is a plain,
 * predictable importer; anything richer should be cleaned up before upload.
 */
export function parseContactsCsv(text: string): Array<Record<string, string>> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const header = (lines[0] ?? '').split(',').map((h) => h.trim().toLowerCase());
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = (lines[i] ?? '').split(',').map((c) => c.trim());
    const row: Record<string, string> = {};
    header.forEach((h, idx) => {
      row[h] = cells[idx] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

/**
 * Map a raw parsed row (loose column names) to a ContactRow, or null if it can't be a contact. Keys are
 * matched case-insensitively so both a CSV (lowercased headers) and a JSON rows array (e.g. `displayName`)
 * work.
 */
export function normaliseRow(raw: Record<string, string>): ContactRow | null {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) lower[k.trim().toLowerCase()] = v;
  const displayName = (lower['displayname'] ?? lower['name'] ?? lower['fullname'] ?? '').trim();
  const phone = (lower['phone'] ?? lower['mobile'] ?? lower['telephone'] ?? '').trim();
  const email = (lower['email'] ?? '').trim();
  if (!displayName && !phone && !email) return null; // blank row
  return { displayName, phone, email: email || undefined };
}

/**
 * Validate + de-duplicate a batch of raw rows against each other and a set of phones already on file.
 * Returns a per-row result; `ok` rows carry the normalised value ready to create. Pure — no writes.
 */
export function planImport(
  rawRows: Array<Record<string, string>>,
  existingPhones: Set<string>,
): RowResult[] {
  const seenPhones = new Set<string>();
  const results: RowResult[] = [];

  rawRows.forEach((raw, i) => {
    const rowNumber = i + 2; // +1 for 0-index, +1 for the header line
    const value = normaliseRow(raw);
    if (!value) {
      results.push({ row: rowNumber, status: 'error', message: 'Empty row' });
      return;
    }
    if (!value.displayName) {
      results.push({ row: rowNumber, status: 'error', message: 'Missing name', value });
      return;
    }
    if (!value.phone) {
      results.push({ row: rowNumber, status: 'error', message: 'Missing phone', value });
      return;
    }
    if (value.email && !isEmail(value.email)) {
      results.push({ row: rowNumber, status: 'error', message: 'Invalid email', value });
      return;
    }
    if (existingPhones.has(value.phone) || seenPhones.has(value.phone)) {
      results.push({
        row: rowNumber,
        status: 'duplicate',
        message: 'A contact with this phone already exists',
        value,
      });
      return;
    }
    seenPhones.add(value.phone);
    results.push({ row: rowNumber, status: 'ok', value });
  });

  return results;
}

export interface ImportSummary {
  total: number;
  ok: number;
  duplicate: number;
  error: number;
}

export function summarise(results: RowResult[]): ImportSummary {
  return {
    total: results.length,
    ok: results.filter((r) => r.status === 'ok').length,
    duplicate: results.filter((r) => r.status === 'duplicate').length,
    error: results.filter((r) => r.status === 'error').length,
  };
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
