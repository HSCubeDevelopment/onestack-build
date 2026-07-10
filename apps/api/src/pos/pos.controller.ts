import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AddSaleLineDto, CompleteSaleDto, OpenSaleDto } from './dto/pos.dto';
import { PosService, SaleView } from './pos.service';

/**
 * Point of sale — owner (Phase 4, card #221). Open a walk-in sale, add items, complete it recording the
 * tender label (no card processing). Tenant-scoped.
 */
@Controller('sales')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PosController {
  constructor(private readonly pos: PosService) {}

  @Post()
  open(@CurrentUser() user: AuthContext, @Body() dto: OpenSaleDto): Promise<SaleView> {
    return this.pos.open(user.tenantId, dto.contactId, user.userId);
  }

  @Get()
  list(@CurrentUser() user: AuthContext): Promise<SaleView[]> {
    return this.pos.list(user.tenantId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<SaleView> {
    return this.pos.get(user.tenantId, id);
  }

  @Post(':id/lines')
  addLine(@CurrentUser() user: AuthContext, @Param('id') id: string, @Body() dto: AddSaleLineDto): Promise<SaleView> {
    return this.pos.addLine(user.tenantId, id, dto);
  }

  @Delete(':id/lines/:lineId')
  removeLine(@CurrentUser() user: AuthContext, @Param('id') id: string, @Param('lineId') lineId: string): Promise<SaleView> {
    return this.pos.removeLine(user.tenantId, id, lineId);
  }

  @Post(':id/complete')
  complete(@CurrentUser() user: AuthContext, @Param('id') id: string, @Body() dto: CompleteSaleDto): Promise<SaleView> {
    return this.pos.complete(user.tenantId, id, dto.tenderType);
  }

  @Post(':id/void')
  void(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<SaleView> {
    return this.pos.void(user.tenantId, id);
  }
}
