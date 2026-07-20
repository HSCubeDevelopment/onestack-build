import { Module } from '@nestjs/common';
import { WorkItemModule } from '../work-items/work-item.module';
import { PipelineController } from './pipeline.controller';
import { PipelineService } from './pipeline.service';

/** Card 52.3 — operations lifecycle pipeline. Owns no tables; PackRegistry comes from global CoreModule. */
@Module({
  imports: [WorkItemModule],
  controllers: [PipelineController],
  providers: [PipelineService],
  exports: [PipelineService],
})
export class PipelineModule {}
