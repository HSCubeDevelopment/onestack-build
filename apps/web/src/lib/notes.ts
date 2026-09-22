/**
 * How a job note reads on screen.
 *
 * Service records were backfilled from the mechanics' WhatsApp group, and each carries a provenance
 * line so the import stays auditable and re-runnable:
 *
 *     Imported from the workshop WhatsApp group · 15 Aug 2026 · ref 403d8b02b6b5
 *     Engine service
 *     Tyre rotation
 *     Customer: Angelo 0420233477
 *
 * That line is for the database, not for the person standing at the car. The stored note keeps it —
 * it is how the importer recognises what it has already written, and how anyone later can tell where
 * a record came from — and this strips it for display, leaving just the work.
 *
 * The date is not lost: every screen that shows a note already shows its timestamp beside it, and the
 * note's date was backdated to when the work actually happened.
 */

const IMPORT_MARKER = 'Imported from the workshop WhatsApp group';

export interface NoteDisplay {
  /** What to show. Never includes the import plumbing. */
  text: string;
  /** True for a backfilled service record — lets a screen label or ice it differently. */
  isService: boolean;
}

export function noteDisplay(body: string): NoteDisplay {
  if (!body.startsWith(IMPORT_MARKER)) return { text: body, isService: false };
  const lines = body.split('\n').slice(1); // drop the provenance line
  const text = lines.join('\n').trim();
  return {
    // A visit with photos but no description still needs to say something.
    text: text || 'Serviced — no description recorded.',
    isService: true,
  };
}

/** Just the text, for the many places that only render a string. */
export const noteText = (body: string): string => noteDisplay(body).text;
