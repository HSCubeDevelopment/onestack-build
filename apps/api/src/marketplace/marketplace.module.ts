import { Module } from '@nestjs/common';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceService } from './marketplace.service';

/** Integration marketplace (Phase 4, card #253). Owns the connection table; TenantService is global. */
@Module({ controllers: [MarketplaceController], providers: [MarketplaceService] })
export class MarketplaceModule {}
