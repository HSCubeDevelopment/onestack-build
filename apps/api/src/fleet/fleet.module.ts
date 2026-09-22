import { Module } from '@nestjs/common';
import { FleetController } from './fleet.controller';
import { FleetPhotoService } from './fleet-photo.service';
import {
  FLEET_PHOTO_STORAGE,
  FallbackFleetPhotoStorage,
  FilesystemFleetPhotoStorage,
  InMemoryFleetPhotoStorage,
  SupabaseFleetPhotoStorage,
} from './fleet-photo-storage';
import { FleetService } from './fleet.service';

/**
 * Fleet & courtesy cars — migrated 1:1 from the standalone "In N Out" staff app. Owns the fleet vehicle /
 * movement / return / booking / photo tables. GENERIC core (Scheduling & Ops). TenantService + AuditService
 * are global. Photo storage resolves in order: both Supabase and a local directory configured ⇒ read
 * through from the bucket to disk (a partial migration); Supabase alone ⇒ the bucket; FLEET_PHOTO_DIR
 * alone ⇒ that directory (local development against a plain Postgres); otherwise in-memory (unit runs).
 */
@Module({
  controllers: [FleetController],
  providers: [
    FleetService,
    FleetPhotoService,
    {
      provide: FLEET_PHOTO_STORAGE,
      useFactory: () =>
        FallbackFleetPhotoStorage.fromEnv() ??
        SupabaseFleetPhotoStorage.fromEnv() ??
        FilesystemFleetPhotoStorage.fromEnv() ??
        new InMemoryFleetPhotoStorage(),
    },
  ],
  exports: [FleetService],
})
export class FleetModule {}
