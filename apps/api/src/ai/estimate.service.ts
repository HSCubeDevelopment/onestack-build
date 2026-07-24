import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DAMAGE_ANALYZER, DamageAnalyzer, MAX_ANALYSIS_IMAGES } from './damage-analyzer';
import { EstimateFromPhotosDto } from './dto/estimate.dto';
import { EstimateDraft, priceScope } from './estimate-pricing';

/**
 * Not-configured: the AI estimator only runs when a real vision provider is wired (ANTHROPIC_API_KEY).
 * Without it the module falls back to a deterministic stub — fine for tests, but we must NOT present
 * stubbed panels to a worker as if they came from the photos. So the endpoint reports "not connected"
 * instead, exactly like the tracking panel, and the UI shows an honest empty state.
 */
export type EstimateResult =
  { configured: false } | ({ configured: true; analyzer: string } & EstimateDraft);

/**
 * Instant photo estimate (employee flow). Reuses the tested damage analyzer (slice A) for the hard part
 * — reading the photos into a scope — then prices that scope with the transparent rules in
 * `estimate-pricing`. Ephemeral: nothing is stored, nothing is sent. The result is a draft the worker
 * edits before it ever becomes a customer quote.
 */
@Injectable()
export class EstimateService {
  constructor(@Inject(DAMAGE_ANALYZER) private readonly analyzer: DamageAnalyzer) {}

  /** True only when a real vision provider is wired — never the deterministic stub. */
  configured(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  async estimate(dto: EstimateFromPhotosDto): Promise<EstimateResult> {
    if (!this.configured()) return { configured: false };

    const images = dto.photos.slice(0, MAX_ANALYSIS_IMAGES).map((p) => ({
      contentType: p.contentType,
      dataBase64: p.dataBase64,
    }));
    if (images.length === 0) {
      throw new BadRequestException('Add at least one photo of the damage.');
    }

    const scope = await this.analyzer.analyze({ images, description: dto.notes });
    const draft = priceScope(scope, { labourRateAud: dto.labourRateAud });
    return { configured: true, analyzer: this.analyzer.name, ...draft };
  }
}
