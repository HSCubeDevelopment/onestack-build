import { Module } from '@nestjs/common';
import { AnthropicTicketExtractor } from './anthropic-ticket-extractor';
import { StubTicketExtractor } from './stub-ticket-extractor';
import { TICKET_EXTRACTOR, TicketExtractor } from './ticket-extractor';
import {
  InMemoryTicketFileStorage,
  SupabaseTicketFileStorage,
  TICKET_FILE_STORAGE,
} from './ticket-file-storage';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

/**
 * Tickets — capture infringement / police notices against a car by AI extraction (replaces the manual
 * form). Owns the onestack_ticket table. Self-contained: its own extractor + file storage provider
 * boundaries, so it imports no other module's files (§5). TenantService is global.
 *
 *   extractor — real Anthropic Claude when ANTHROPIC_API_KEY is set, deterministic stub otherwise, so the
 *               capture-and-store flow works with no external API. Output is always an editable draft.
 *   storage   — Supabase Storage when a bucket is configured (accepts images AND PDFs), in-memory otherwise.
 */
@Module({
  controllers: [TicketsController],
  providers: [
    TicketsService,
    {
      provide: TICKET_EXTRACTOR,
      useFactory: (): TicketExtractor => {
        const key = process.env.ANTHROPIC_API_KEY;
        return key ? new AnthropicTicketExtractor(key) : new StubTicketExtractor();
      },
    },
    {
      provide: TICKET_FILE_STORAGE,
      useFactory: () => SupabaseTicketFileStorage.fromEnv() ?? new InMemoryTicketFileStorage(),
    },
  ],
  exports: [TicketsService],
})
export class TicketsModule {}
