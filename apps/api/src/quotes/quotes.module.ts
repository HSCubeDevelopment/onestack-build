import { Module } from '@nestjs/common';
import { QuoteController } from './quote.controller';
import { QuoteService } from './quote.service';

// LineItemService comes from the global LineItemsModule.
@Module({
  controllers: [QuoteController],
  providers: [QuoteService],
  exports: [QuoteService],
})
export class QuotesModule {}
