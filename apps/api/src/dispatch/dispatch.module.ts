import { Module } from '@nestjs/common';
import { BoardModule } from '../board/board.module';
import { WorkItemModule } from '../work-items/work-item.module';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';

/**
 * Dispatch & assignment (Phase 3). Per-job dispatch status/ETA + the dispatch board (jobs by technician).
 * Reuses BoardModule (the job-board read-model) and WorkItemModule (job existence). Owns onestack_dispatch.
 */
@Module({
  imports: [BoardModule, WorkItemModule],
  controllers: [DispatchController],
  providers: [DispatchService],
})
export class DispatchModule {}
