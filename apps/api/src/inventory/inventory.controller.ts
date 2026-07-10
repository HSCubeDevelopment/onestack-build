import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AdjustStockDto, CreateItemDto, StocktakeDto, UpdateItemDto } from './dto/inventory.dto';
import { InventoryItemView, InventoryService } from './inventory.service';

/**
 * Inventory & stock — owner (Phase 4, cards #220 + #260). Manage stock items, adjust on-hand quantity
 * (receive / use / adjust / stocktake), and see auto-reorder suggestions (reorder up to par). Tenant-scoped.
 */
@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Post()
  create(@CurrentUser() user: AuthContext, @Body() dto: CreateItemDto): Promise<InventoryItemView> {
    return this.inventory.createItem(user.tenantId, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthContext, @Query('low') low?: string): Promise<InventoryItemView[]> {
    return this.inventory.list(user.tenantId, low === 'true');
  }

  // Auto-reorder suggestions (card #260). Declared BEFORE :id-shaped routes so 'reorder' isn't an id.
  @Get('reorder')
  reorder(@CurrentUser() user: AuthContext): Promise<InventoryItemView[]> {
    return this.inventory.reorderSuggestions(user.tenantId);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateItemDto,
  ): Promise<InventoryItemView> {
    return this.inventory.update(user.tenantId, id, dto);
  }

  @Post(':id/movement')
  adjust(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: AdjustStockDto,
  ): Promise<InventoryItemView> {
    return this.inventory.adjust(user.tenantId, id, dto, user.userId);
  }

  /** Stocktake: set the counted on-hand (card #260). */
  @Post(':id/stocktake')
  stocktake(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: StocktakeDto,
  ): Promise<InventoryItemView> {
    return this.inventory.stocktake(user.tenantId, id, dto.countedQuantity, user.userId);
  }
}
