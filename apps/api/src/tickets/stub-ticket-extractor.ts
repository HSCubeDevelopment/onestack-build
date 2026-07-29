import { emptyExtraction, TicketExtraction, TicketExtractor, TicketFile } from './ticket-extractor';

/**
 * Deterministic stub — runs when ANTHROPIC_API_KEY is not set (local dev, CI, tests). It cannot actually
 * read the notice, so rather than invent fine amounts it returns a BLANK draft with a note telling the
 * human to type the details in. That keeps the capture-and-store flow fully working offline while being
 * honest: no fabricated ticket data. It still validates that at least one readable file was supplied.
 */
export class StubTicketExtractor implements TicketExtractor {
  readonly name = 'stub';

  async extract(files: TicketFile[]): Promise<TicketExtraction> {
    if (files.length === 0) throw new Error('No file to extract from');
    return {
      ...emptyExtraction(),
      notes: 'AI extraction is not configured — please enter the ticket details from the notice.',
    };
  }
}
