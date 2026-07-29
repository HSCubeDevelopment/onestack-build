import Anthropic from '@anthropic-ai/sdk';
import { parseTicket, TicketExtraction, TicketExtractor, TicketFile } from './ticket-extractor';

/** Image types Claude vision accepts. HEIC/HEIF phone photos are unsupported upstream and dropped. */
const VISION_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

const SYSTEM = [
  'You extract the fields from an Australian traffic / parking infringement notice (or a follow-up',
  'notice such as a Notice of Final Demand or Penalty Reminder). You are given a photo or PDF of the',
  'notice. Read only what is printed — never guess a value that is not shown; leave a field blank if it',
  'is not on the document. This is a DRAFT a human reviews and corrects before it is saved; nothing you',
  'output is filed, paid, or disputed.',
].join(' ');

const INSTRUCTION = [
  'Extract this infringement notice. Respond with ONLY a JSON object, no prose, of the form:',
  '{',
  '  "noticeType": string,          // e.g. "Infringement Notice", "Notice of Final Demand"',
  '  "noticeNumber": string,        // the main reference to quote when paying',
  '  "infringementNumber": string,',
  '  "obligationNumber": string,',
  '  "rego": string,                // vehicle registration',
  '  "state": string,               // issuing state, e.g. "VIC"',
  '  "agency": string,              // enforcement agency / issuer',
  '  "offence": string,             // offence description',
  '  "offenceCode": string,',
  '  "offenceDate": string,         // as printed, e.g. "18 MAR 2026"',
  '  "offenceTime": string,         // as printed, e.g. "5:33pm"',
  '  "location": string,',
  '  "issueDate": string,',
  '  "dueDate": string,',
  '  "penalty": number,             // dollars, e.g. 102.00',
  '  "fees": number,                // dollars',
  '  "amountDue": number,           // dollars, the total now payable',
  '  "recipientName": string,',
  '  "recipientAbn": string,        // ACN / ARBN / ABN if a company is named',
  '  "recipientAddress": string,',
  '  "notes": string                // anything notable, or why a field is blank',
  '}',
  'Use "" for any text field not printed and 0 for any amount not printed.',
].join('\n');

/**
 * Real AI adapter — Anthropic Claude (used only when ANTHROPIC_API_KEY is set; the stub runs otherwise).
 * Sends the notice's bytes + a short instruction over HTTPS — no tenant identifiers. Photos go as image
 * blocks and PDFs as document blocks (Claude reads PDFs natively). Output is capped (max_tokens) and the
 * caller has already trimmed the file set (MAX_TICKET_FILES). We ask for JSON-only and parse it; a refusal
 * or unparseable reply surfaces as an error the caller turns into a clean failure rather than a bad draft.
 *
 * Model defaults to claude-opus-4-8, overridable with AI_TICKET_MODEL.
 */
export class AnthropicTicketExtractor implements TicketExtractor {
  readonly name: string;
  private readonly client: Anthropic;

  constructor(apiKey: string, model = process.env.AI_TICKET_MODEL || 'claude-opus-4-8') {
    this.client = new Anthropic({ apiKey });
    this.name = model;
  }

  async extract(files: TicketFile[]): Promise<TicketExtraction> {
    const usable = files.filter(
      (f) => f.contentType === 'application/pdf' || VISION_MEDIA_TYPES.has(f.contentType),
    );
    if (usable.length === 0) {
      throw new Error('No readable files (JPEG/PNG/WebP/GIF or PDF only)');
    }

    const content: Anthropic.ContentBlockParam[] = usable.map((f) =>
      f.contentType === 'application/pdf'
        ? {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: f.dataBase64 },
          }
        : {
            type: 'image',
            source: {
              type: 'base64',
              media_type: f.contentType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: f.dataBase64,
            },
          },
    );
    content.push({ type: 'text', text: INSTRUCTION });

    const response = await this.client.messages.create({
      model: this.name,
      max_tokens: 2048,
      system: SYSTEM,
      messages: [{ role: 'user', content }],
    });

    if (response.stop_reason === 'refusal') {
      throw new Error('AI declined to read this notice');
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    return parseTicket(text);
  }
}
