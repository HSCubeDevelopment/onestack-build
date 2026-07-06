import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CreatePriceBookItemDto, UpdatePriceBookItemDto } from './dto/price-book.dto';
import { PriceBookItemView, PriceBookService } from './price-book.service';

/** Settings → Price book (card #32). Reusable labour/parts catalogue picked when building quote lines. */
@Controller('price-book')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PriceBookController {
  constructor(private readonly priceBook: PriceBookService) {}

  @Post()
  create(
    @CurrentUser() user: AuthContext,
    @Body() dto: CreatePriceBookItemDto,
  ): Promise<{ item: PriceBookItemView; duplicateNameWarning: boolean }> {
    return this.priceBook.create(user.tenantId, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthContext,
    @Query('q') q?: string,
    @Query('activeOnly') activeOnly?: string,
  ): Promise<PriceBookItemView[]> {
    return this.priceBook.list(user.tenantId, q, activeOnly === 'true');
  }

  @Get(':id')
  get(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<PriceBookItemView> {
    return this.priceBook.get(user.tenantId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdatePriceBookItemDto,
  ): Promise<PriceBookItemView> {
    return this.priceBook.update(user.tenantId, id, dto);
  }

  @Post(':id/deactivate')
  deactivate(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
  ): Promise<PriceBookItemView> {
    return this.priceBook.deactivate(user.tenantId, id);
  }
}
