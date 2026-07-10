import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AdjustStockDto, CreateItemDto, UpdateItemDto } from './dto/inventory.dto';
import { InventoryItemView, InventoryService } from './inventory.service';

/**
 * Inventory & stock — owner (Phase 4, card #220). Manage stock items, adjust on-hand quantity (receive /
 * use / adjust) and see what needs reordering. Tenant-scoped.
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
}
