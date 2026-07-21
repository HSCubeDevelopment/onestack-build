import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AllowStaff } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateTowCollectionDto } from './dto/tow.dto';
import { CreateYardDropDto, CreateYardDto, UpdateYardDto } from './dto/yards.dto';
import { TowCollectionResult, TowService } from './tow.service';
import { YardDashboardStats, YardDropView, YardsService, YardView } from './yards.service';

/**
 * Yards & vehicle logistics (YRD-1). Reads and the drop/collect flow are open to STAFF — a floor worker
 * or tow driver parks incoming cars. Managing the yard NETWORK (create/edit/delete) is OWNER-only, which
 * is the RolesGuard default (no decorator). The API is the enforcement; the web nav only mirrors it.
 */
@Controller('yards')
@UseGuards(JwtAuthGuard, RolesGuard)
export class YardsController {
  constructor(
    private readonly yards: YardsService,
    private readonly tow: TowService,
  ) {}

  @AllowStaff()
  @Get()
  list(@CurrentUser() user: AuthContext): Promise<YardView[]> {
    return this.yards.listYards(user.tenantId);
  }

  @AllowStaff()
  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthContext): Promise<YardDashboardStats> {
    return this.yards.getDashboardStats(user.tenantId);
  }

  @AllowStaff()
  @Get('awaiting')
  awaiting(@CurrentUser() user: AuthContext): Promise<YardDropView[]> {
    return this.yards.listAwaiting(user.tenantId);
  }

  @Post()
  create(@CurrentUser() user: AuthContext, @Body() dto: CreateYardDto): Promise<YardView> {
    return this.yards.createYard(user.tenantId, user.userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateYardDto,
  ): Promise<YardView> {
    return this.yards.updateYard(user.tenantId, user.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<void> {
    await this.yards.deleteYard(user.tenantId, user.userId, id);
  }

  @AllowStaff()
  @Post('drops')
  drop(@CurrentUser() user: AuthContext, @Body() dto: CreateYardDropDto): Promise<YardDropView> {
    return this.yards.dropCar(user.tenantId, user.userId, dto);
  }

  /** Tow collection (YRD-2): a driver records a pickup → a job file is created and the team notified. */
  @AllowStaff()
  @Post('tow-collections')
  towCollect(
    @CurrentUser() user: AuthContext,
    @Body() dto: CreateTowCollectionDto,
  ): Promise<TowCollectionResult> {
    return this.tow.collect(user.tenantId, user.userId, dto);
  }

  @AllowStaff()
  @Get('drops/:id')
  getDrop(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<YardDropView> {
    return this.yards.getDrop(user.tenantId, id);
  }

  @AllowStaff()
  @Post('drops/:id/collect')
  collect(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<YardDropView> {
    return this.yards.collectDrop(user.tenantId, user.userId, id);
  }
}
