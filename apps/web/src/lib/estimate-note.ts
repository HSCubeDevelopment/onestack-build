/**
 * Parse a saved AI-estimate note back into structured lines, so it can be shown as a TABLE instead of a
 * wall of text. Estimates are persisted two ways: newer saves keep a structured `estimate_draft` record
 * (rendered directly), but the human-readable SUMMARY is also written to the job's notes — and that note
 * is what shows in the activity timeline. Older estimates exist only as that note.
 *
 * The format is one we generate ourselves (EstimateFlow's buildSummary), so parsing it is reliable. Even
 * so, every step is defensive: anything unrecognised returns null and the caller falls back to the plain
 * text. Pure functions, no React — safe to unit-test and to call during render.
 */

export interface NoteFix {
  operation: string;
  panel: string;
  note: string;
}
export interface NotePart {
  name: string;
  quantity: number;
  unitPrice: string; // as printed, e.g. "$350.00"
}
export interface NoteLabour {
  task: string;
  hours: string; // as printed, e.g. "3h"
}
export interface ParsedEstimateNote {
  /** The headline total as printed, e.g. "$3,844.50". Empty when the note didn't carry one. */
  total: string;
  summary: string;
  fixes: NoteFix[];
  parts: NotePart[];
  labour: NoteLabour[];
  /** Totals lines split into label/value pairs, e.g. ["Subtotal", "$3,495.00"]. */
  totals: [string, string][];
  flags: string[];
}

const BULLET = /^[•\-*]\s*/;
const SECTIONS: Record<string, 'fixes' | 'parts' | 'labour'> = {
  'what needs fixing:': 'fixes',
  'parts:': 'parts',
  'labour:': 'labour',
};

/** True if this note body looks like a saved AI estimate. */
export function isEstimateNote(body: string): boolean {
  return /^\s*AI estimate/i.test(body);
}

/** "Parts $1,400.00 · Labour $1,615.00" → [["Parts","$1,400.00"], ["Labour","$1,615.00"]] */
function parseTotalsLine(line: string): [string, string][] {
  const out: [string, string][] = [];
  for (const chunk of line.split('·')) {
    const m = chunk.trim().match(/^(.+?)\s+(\$[\d,.]+)$/);
    if (m) out.push([m[1]!.trim(), m[2]!]);
  }
  return out;
}

export function parseEstimateNote(body: string): ParsedEstimateNote | null {
  if (!body || !isEstimateNote(body)) return null;

  const lines = body.split('\n');
  const head = lines[0] ?? '';
  const total = head.match(/\$[\d,.]+/)?.[0] ?? '';

  const result: ParsedEstimateNote = {
    total,
    summary: '',
    fixes: [],
    parts: [],
    labour: [],
    totals: [],
    flags: [],
  };

  let section: 'fixes' | 'parts' | 'labour' | null = null;
  const summaryLines: string[] = [];

  for (const raw of lines.slice(1)) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('⚠')) {
      result.flags.push(line.replace(/^⚠\s*/, ''));
      continue;
    }

    const asSection = SECTIONS[line.toLowerCase()];
    if (asSection) {
      section = asSection;
      continue;
    }

    if (BULLET.test(line)) {
      const item = line.replace(BULLET, '').trim();
      if (section === 'fixes') {
        // "Replace — Front bumper cover (a note)"
        const m = item.match(/^(.+?)\s+—\s+(.+)$/);
        const operation = m ? m[1]!.trim() : '';
        let rest = m ? m[2]!.trim() : item;
        let note = '';
        const paren = rest.match(/^(.*?)\s*\((.+)\)$/);
        if (paren) {
          rest = paren[1]!.trim();
          note = paren[2]!.trim();
        }
        result.fixes.push({ operation, panel: rest, note });
      } else if (section === 'parts') {
        // "Front bumper cover (replacement panel) ×1 @ $350.00"
        const m = item.match(/^(.+?)\s*[×x]\s*([\d.]+)\s*@\s*(\$[\d,.]+)$/);
        if (m) {
          result.parts.push({
            name: m[1]!.trim(),
            quantity: Number(m[2]) || 1,
            unitPrice: m[3]!,
          });
        } else {
          result.parts.push({ name: item, quantity: 1, unitPrice: '' });
        }
      } else if (section === 'labour') {
        // "replace Front bumper cover — 3h"
        const m = item.match(/^(.+?)\s+—\s+([\d.]+\s*h)$/i);
        result.labour.push(
          m ? { task: m[1]!.trim(), hours: m[2]!.replace(/\s+/g, '') } : { task: item, hours: '' },
        );
      }
      continue;
    }

    // A "Parts $x · Labour $y" style totals line.
    if (line.includes('·') && line.includes('$')) {
      const pairs = parseTotalsLine(line);
      if (pairs.length) {
        result.totals.push(...pairs);
        continue;
      }
    }

    // Anything else before the first section is the summary prose.
    if (!section) summaryLines.push(line);
  }

  result.summary = summaryLines.join(' ').trim();

  // Only claim a successful parse if we actually extracted structure worth tabulating.
  const structured =
    result.fixes.length + result.parts.length + result.labour.length + result.totals.length;
  return structured > 0 ? result : null;
}
