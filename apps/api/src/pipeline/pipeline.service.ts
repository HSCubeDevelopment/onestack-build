import { Injectable } from '@nestjs/common';
import { PackRegistry } from '../core/pack-registry';
import { WorkItemService } from '../work-items/work-item.service';
import { buildPipeline, PipelineView } from './pipeline';

/**
 * Card 52.3 — the operations pipeline. A dashboard view over the workflow engine's states.
 *
 * Owns no tables: it reads work items through WorkItemService and stages through the PackRegistry, so
 * core never learns a vertical's stage names. All the interesting logic is in `pipeline.ts` (pure).
 *
 * NOT YET IMPLEMENTED, both blocked on unbuilt cards, and deliberately absent rather than faked:
 *   - per-workshop filter → card 52.2 (locations don't exist yet)
 *   - per-item file-readiness % → card 6.17 (the readiness engine doesn't exist yet)
 * A readiness bar that always read 100% would be worse than no bar at all.
 */
@Injectable()
export class PipelineService {
  constructor(
    private readonly registry: PackRegistry,
    private readonly workItems: WorkItemService,
  ) {}

  /**
   * The pipeline for one work-item type. `now` is injectable so the stuck thresholds are testable
   * without waiting three days.
   */
  async view(tenantId: string, type = 'job', now: Date = new Date()): Promise<PipelineView> {
    const def = this.registry.getWorkItemType(type).workflow;
    const items = await this.workItems.list(tenantId, type);
    return buildPipeline(
      def,
      items.map((w) => ({
        id: w.id,
        reference: w.reference,
        stateName: w.stateName,
        updatedAt: w.updatedAt,
      })),
      now,
    );
  }
}
