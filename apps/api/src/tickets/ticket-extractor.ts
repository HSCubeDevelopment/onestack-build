/**
 * The ticket-extraction gateway. A `TicketExtractor` turns a photo or PDF of an infringement / police
 * notice into a structured, EDITABLE DRAFT — provider-abstracted on purpose, exactly like the damage
 * analyzer: the real Anthropic Claude adapter runs when a key is configured, and a deterministic stub
 * runs otherwise (local dev, CI, tests), so the capture-and-store flow works with NO external API.
 *
 * Golden rule: whatever an extractor returns is a DRAFT a human confirms before it is saved — nothing
 * here files, pays, or disputes anything. Extractors are tenant-agnostic: they only see the bytes handed
 * to them, never the DB. Cost caps live at this boundary — the caller trims the file set to MAX_TICKET_FILES.
 */

/** Cost cap: never send more than this many files to an extractor in one call. */
export const MAX_TICKET_FILES = 5;

/** A file to extract from — a photo of the notice or the notice PDF. Base64, no data: prefix. */
export interface TicketFile {
  /** MIME type: an image (jpeg/png/webp/gif) or application/pdf. */
  contentType: string;
  dataBase64: string;
}

/**
 * The structured ticket fields, as extracted. A flat shape the review form binds to directly. Amounts are
 * whole cents (the adapter converts the printed dollars). Every field is optional in spirit — a blank means
 * "not found / not printed", which the human fills in. Nothing is invented.
 */
export interface TicketExtraction {
  noticeType: string; // 'Infringement Notice' | 'Notice of Final Demand' | 'Penalty Reminder Notice' | …
  noticeNumber: string; // the primary reference to quote (infringement or obligation number)
  infringementNumber: string;
  obligationNumber: string;
  rego: string; // vehicle registration as printed
  state: string; // issuing state, e.g. 'VIC'
  agency: string; // enforcement agency / issuer, e.g. 'Melbourne City Council'
  offence: string; // offence description
  offenceCode: string;
  offenceDate: string; // as printed, e.g. '18 MAR 2026'
  offenceTime: string; // as printed, e.g. '5:33pm'
  location: string;
  issueDate: string;
  dueDate: string;
  penaltyCents: number;
  feesCents: number;
  amountDueCents: number;
  recipientName: string;
  recipientAbn: string; // ACN / ARBN / ABN, if the notice names a company
  recipientAddress: string;
  notes: string; // anything notable the model wants to flag (or why a field is blank)
}

export interface TicketExtractor {
  /** Short identifier recorded on the ticket for audit (e.g. 'stub' or the Claude model id). */
  readonly name: string;
  extract(files: TicketFile[]): Promise<TicketExtraction>;
}

/** DI token for the configured extractor (Anthropic when a key is set, stub otherwise). */
export const TICKET_EXTRACTOR = Symbol('TICKET_EXTRACTOR');

/** A fully-blank extraction — the base every adapter and the parser build on. */
export function emptyExtraction(): TicketExtraction {
  return {
    noticeType: '',
    noticeNumber: '',
    infringementNumber: '',
    obligationNumber: '',
    rego: '',
    state: '',
    agency: '',
    offence: '',
    offenceCode: '',
    offenceDate: '',
    offenceTime: '',
    location: '',
    issueDate: '',
    dueDate: '',
    penaltyCents: 0,
    feesCents: 0,
    amountDueCents: 0,
    recipientName: '',
    recipientAbn: '',
    recipientAddress: '',
    notes: '',
  };
}

/** The JSON shape we ask Claude for. Dollars in, cents out (parseTicket converts). */
interface RawTicket {
  noticeType?: unknown;
  noticeNumber?: unknown;
  infringementNumber?: unknown;
  obligationNumber?: unknown;
  rego?: unknown;
  state?: unknown;
  agency?: unknown;
  offence?: unknown;
  offenceCode?: unknown;
  offenceDate?: unknown;
  offenceTime?: unknown;
  location?: unknown;
  issueDate?: unknown;
  dueDate?: unknown;
  penalty?: unknown; // dollars
  fees?: unknown; // dollars
  amountDue?: unknown; // dollars
  recipientName?: unknown;
  recipientAbn?: unknown;
  recipientAddress?: unknown;
  notes?: unknown;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Coerce a printed dollar amount (number or "$286.80" / "286.80") into whole cents. */
export function dollarsToCents(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v * 100);
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^0-9.]/g, ''));
    if (Number.isFinite(n)) return Math.round(n * 100);
  }
  return 0;
}

/**
 * Pull the first JSON object out of a model reply and coerce it into a clean, validated extraction.
 * Tolerant by design — a missing field becomes a blank, not an error — because a real notice with an
 * unusual layout should still produce a mostly-filled draft for the human to finish, never a hard failure.
 * Exported for unit tests.
 */
export function parseTicket(text: string): TicketExtraction {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('AI returned an unparseable ticket');
  }
  let raw: RawTicket;
  try {
    raw = JSON.parse(text.slice(start, end + 1)) as RawTicket;
  } catch {
    throw new Error('AI returned invalid JSON for the ticket');
  }

  const noticeNumber = str(raw.noticeNumber);
  const infringementNumber = str(raw.infringementNumber);
  const obligationNumber = str(raw.obligationNumber);
  return {
    ...emptyExtraction(),
    noticeType: str(raw.noticeType),
    // Prefer an explicit noticeNumber; otherwise fall back to whichever reference was found.
    noticeNumber: noticeNumber || infringementNumber || obligationNumber,
    infringementNumber,
    obligationNumber,
    rego: str(raw.rego).toUpperCase(),
    state: str(raw.state).toUpperCase(),
    agency: str(raw.agency),
    offence: str(raw.offence),
    offenceCode: str(raw.offenceCode),
    offenceDate: str(raw.offenceDate),
    offenceTime: str(raw.offenceTime),
    location: str(raw.location),
    issueDate: str(raw.issueDate),
    dueDate: str(raw.dueDate),
    penaltyCents: dollarsToCents(raw.penalty),
    feesCents: dollarsToCents(raw.fees),
    amountDueCents: dollarsToCents(raw.amountDue),
    recipientName: str(raw.recipientName),
    recipientAbn: str(raw.recipientAbn),
    recipientAddress: str(raw.recipientAddress),
    notes: str(raw.notes),
  };
}
