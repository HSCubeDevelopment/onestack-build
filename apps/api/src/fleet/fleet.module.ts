import { Module } from '@nestjs/common';
import { FleetController } from './fleet.controller';
import { FleetPhotoService } from './fleet-photo.service';
import {
  FLEET_PHOTO_STORAGE,
  InMemoryFleetPhotoStorage,
  SupabaseFleetPhotoStorage,
} from './fleet-photo-storage';
import { FleetService } from './fleet.service';

/**
 * Fleet & courtesy cars — migrated 1:1 from the standalone "In N Out" staff app. Owns the fleet vehicle /
 * movement / return / booking / photo tables. GENERIC core (Scheduling & Ops). TenantService + AuditService
 * are global. Photos use Supabase Storage when a bucket is configured, in-memory otherwise (pure-unit runs).
 */
@Module({
  controllers: [FleetController],
  providers: [
    FleetService,
    FleetPhotoService,
    {
      provide: FLEET_PHOTO_STORAGE,
      useFactory: () => SupabaseFleetPhotoStorage.fromEnv() ?? new InMemoryFleetPhotoStorage(),
    },
  ],
  exports: [FleetService],
})
export class FleetModule {}
