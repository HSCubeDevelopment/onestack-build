import { Module } from '@nestjs/common';
import { CityTagConnector } from './citytag.connector';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';

/**
 * Vehicle live-location (CityTag) — Phase 2 of the In N Out migration (§9). The connector is the single
 * anti-corruption layer around CityTag's undocumented backend; the service resolves per-tenant creds and
 * degrades gracefully. No tables of its own.
 */
@Module({
  controllers: [TrackingController],
  providers: [TrackingService, CityTagConnector],
})
export class TrackingModule {}
