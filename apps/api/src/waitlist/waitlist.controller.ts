import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AddWaitlistDto, FillWaitlistDto } from './dto/waitlist.dto';
import { WaitlistService, WaitlistView } from './waitlist.service';

/**
 * Waitlist & auto-fill — owner (Phase 4, card #210). Add customers to the waitlist, list who's waiting,
 * find candidates to fill a freed slot, and confirm a candidate into a booking. Tenant-scoped.
 */
@Controller('waitlist')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  @Post()
  add(@CurrentUser() user: AuthContext, @Body() dto: AddWaitlistDto): Promise<WaitlistView> {
    return this.waitlist.add(user.tenantId, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthContext,
    @Query('resourceId') resourceId?: string,
  ): Promise<WaitlistView[]> {
    // When a resourceId is given, return only the candidates that can fill that resource's slot.
    return resourceId
      ? this.waitlist.candidates(user.tenantId, resourceId)
      : this.waitlist.list(user.tenantId);
  }

  @Post(':id/fill')
  fill(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: FillWaitlistDto,
  ): Promise<WaitlistView> {
    return this.waitlist.fill(user.tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<void> {
    await this.waitlist.remove(user.tenantId, id);
  }
}
