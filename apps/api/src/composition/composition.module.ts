import { Global, Module } from '@nestjs/common';
import { EventBus } from './event-bus';
import { FeatureAdminController } from './feature-admin.controller';
import { FeatureFlagService } from './feature-flag.service';
import { FeatureGuard } from './feature.guard';

@Global()
@Module({
  controllers: [FeatureAdminController],
  providers: [FeatureFlagService, FeatureGuard, EventBus],
  exports: [FeatureFlagService, FeatureGuard, EventBus],
})
export class CompositionModule {}
