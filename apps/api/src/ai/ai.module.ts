import { Module } from '@nestjs/common';
import { WorkItemModule } from '../work-items/work-item.module';
import { AnthropicDamageAnalyzer } from './anthropic-damage-analyzer';
import { DAMAGE_ANALYZER, DamageAnalyzer } from './damage-analyzer';
import { DamageScopeController } from './damage-scope.controller';
import { DamageScopeService } from './damage-scope.service';
import { StubDamageAnalyzer } from './stub-damage-analyzer';

/**
 * AI module (Phase 2 flagship, slice A). Hosts the provider-abstracted damage-scope gateway. The
 * analyzer is chosen once at boot: real Anthropic Claude vision when ANTHROPIC_API_KEY is set, the
 * deterministic stub otherwise (local dev, CI, tests) — so the photo-to-quote flow needs NO external
 * API in the MVP. Reads a job's photos through WorkItemModule's AttachmentService.
 */
@Module({
  imports: [WorkItemModule], // for AttachmentService (job photos)
  controllers: [DamageScopeController],
  providers: [
    DamageScopeService,
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
