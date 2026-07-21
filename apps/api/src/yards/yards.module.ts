import { Module } from '@nestjs/common';
import { YardsController } from './yards.controller';
import { YardsService } from './yards.service';

/**
 * Yards & vehicle logistics (YRD-1). A plain core module — no pack registry, no workflow engine. It
 * exports YardsService so the owner dashboard can compose an "In yards" count (cross-service, not
 * cross-table).
 */
@Module({
  controllers: [YardsController],
  providers: [YardsService],
  exports: [YardsService],
})
export class YardsModule {}
