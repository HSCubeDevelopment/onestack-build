import { Module } from '@nestjs/common';
import { PriceBookController } from './price-book.controller';
import { PriceBookService } from './price-book.service';

/** Price book (card #32) — Sales & Money core. Standalone: it never touches quote/invoice lines. */
@Module({
  controllers: [PriceBookController],
  providers: [PriceBookService],
  exports: [PriceBookService], // AI parts list prices from the price book
})
export class PriceBookModule {}
