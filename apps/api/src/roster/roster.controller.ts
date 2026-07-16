import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AllowStaff } from '../auth/roles.decorator';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AddShiftDto } from './dto/roster.dto';
import { RosterService, ShiftView } from './roster.service';

/**
 * Roster & staff management — owner (Phase 4, card #211). Add shifts / time-off, list the roster for a
 * period, and remove a block. Tenant-scoped.
 */
@Controller('shifts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RosterController {
  constructor(private readonly roster: RosterService) {}

  @Post()
  add(@CurrentUser() user: AuthContext, @Body() dto: AddShiftDto): Promise<ShiftView> {
    return this.roster.add(user.tenantId, dto);
  }

  @AllowStaff()
  @Get()
  list(
    @CurrentUser() user: AuthContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<ShiftView[]> {
    return this.roster.list(user.tenantId, from, to);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<void> {
    await this.roster.remove(user.tenantId, id);
  }
}
