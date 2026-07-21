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
import { CreateSiteDto, UpdateSiteDto } from './dto/sites.dto';
import { SitesService, SiteView } from './sites.service';

/**
 * Multi-site (SITE-1). Listing sites is open to STAFF — a worker filters/tags a job by location. Managing
 * the site NETWORK (create/edit/delete) is OWNER-only, which is the RolesGuard default (no decorator).
 * The API is the enforcement; the web nav only mirrors it.
 */
@Controller('sites')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SitesController {
  constructor(private readonly sites: SitesService) {}

  @AllowStaff()
  @Get()
  list(@CurrentUser() user: AuthContext): Promise<SiteView[]> {
    return this.sites.list(user.tenantId);
  }

  @Post()
  create(@CurrentUser() user: AuthContext, @Body() dto: CreateSiteDto): Promise<SiteView> {
    return this.sites.create(user.tenantId, user.userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateSiteDto,
  ): Promise<SiteView> {
    return this.sites.update(user.tenantId, user.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<void> {
    await this.sites.remove(user.tenantId, user.userId, id);
  }
}
