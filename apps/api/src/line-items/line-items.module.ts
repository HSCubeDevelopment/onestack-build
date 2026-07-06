import { Global, Module } from '@nestjs/common';
import { LineItemService } from './line-item.service';

@Global()
@Module({
  providers: [LineItemService],
  exports: [LineItemService],
})
export class LineItemsModule {}
