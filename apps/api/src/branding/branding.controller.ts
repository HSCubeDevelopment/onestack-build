import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { BrandingService, BrandView } from './branding.service';
import { UpsertBrandDto } from './dto/branding.dto';

/**
 * Brand — owner (card #151). Read or update the tenant's brand (business name, logo, colour, contact
 * details) that customer-facing pages render under. Tenant-scoped.
 */
@Controller('brand')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BrandingController {
  constructor(private readonly branding: BrandingService) {}

  @Get()
  get(@CurrentUser() user: AuthContext): Promise<BrandView> {
    return this.branding.get(user.tenantId);
  }

  @Put()
  upsert(@CurrentUser() user: AuthContext, @Body() dto: UpsertBrandDto): Promise<BrandView> {
    return this.branding.upsert(user.tenantId, dto);
  }
}
