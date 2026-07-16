import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ConnectIntegrationDto } from './dto/marketplace.dto';
import { IntegrationView, MarketplaceService } from './marketplace.service';

/**
 * Integration marketplace — owner (Phase 4, card #253). Browse the catalogue and connect/disconnect
 * integrations per tenant. Tenant-scoped.
 */
@Controller('integrations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MarketplaceController {
  constructor(private readonly marketplace: MarketplaceService) {}

  @Get()
  list(@CurrentUser() user: AuthContext): Promise<IntegrationView[]> {
    return this.marketplace.list(user.tenantId);
  }

  @Post(':slug/connect')
  connect(
    @CurrentUser() user: AuthContext,
    @Param('slug') slug: string,
    @Body() dto: ConnectIntegrationDto,
  ): Promise<IntegrationView> {
    return this.marketplace.connect(user.tenantId, slug, dto.config);
  }

  @Post(':slug/disconnect')
  disconnect(
    @CurrentUser() user: AuthContext,
    @Param('slug') slug: string,
  ): Promise<IntegrationView> {
    return this.marketplace.disconnect(user.tenantId, slug);
  }
}
