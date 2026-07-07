import { Module } from '@nestjs/common';
import { PriceBookModule } from '../price-book/price-book.module';
import { QuotesModule } from '../quotes/quotes.module';
import { WorkItemModule } from '../work-items/work-item.module';
import { AnthropicDamageAnalyzer } from './anthropic-damage-analyzer';
import { DAMAGE_ANALYZER, DamageAnalyzer } from './damage-analyzer';
import { DamageScopeController } from './damage-scope.controller';
import { DamageScopeService } from './damage-scope.service';
import { ScopePartController } from './scope-part.controller';
import { ScopePartService } from './scope-part.service';
import { StubDamageAnalyzer } from './stub-damage-analyzer';

/**
 * AI module (Phase 2 flagship). Hosts the photo-to-quote pipeline:
 *   slice A — damage scope: a provider-abstracted gateway (real Anthropic Claude vision when
 *             ANTHROPIC_API_KEY is set, a deterministic stub otherwise) turns a job's photos into an
 *             editable draft scope. Needs no external API in the MVP.
 *   slice B — parts list: derives an editable, price-book-priced parts list from the scope and builds a
 *             Draft quote from it through the shared Quote engine. Nothing is sent or ordered.
 *
 * Reads job photos via WorkItemModule; prices via PriceBookModule; builds quotes via QuotesModule — all
 * through their public services (never their tables).
 */
@Module({
  imports: [WorkItemModule, PriceBookModule, QuotesModule],
  controllers: [DamageScopeController, ScopePartController],
  providers: [
    DamageScopeService,
    ScopePartService,
    {
      provide: DAMAGE_ANALYZER,
      useFactory: (): DamageAnalyzer => {
        const key = process.env.ANTHROPIC_API_KEY;
        return key ? new AnthropicDamageAnalyzer(key) : new StubDamageAnalyzer();
      },
    },
  ],
})
export class AiModule {}
