import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { CompositionModule } from './composition/composition.module';
import { ContactsModule } from './contacts/contacts.module';
import { HealthController } from './health/health.controller';
import { SchedulingModule } from './scheduling/scheduling.module';
import { TenantModule } from './tenancy/tenant.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TenantModule, // global: PrismaService (admin) + TenantService (app_user wrapper)
    AuthModule, // global: JwtAuthGuard + RolesGuard
    CompositionModule, // global: FeatureFlagService + FeatureGuard + EventBus
    ContactsModule,
    SchedulingModule, // toggleable module (OFF by default) — demonstrates feature enforcement
  ],
  controllers: [HealthController],
})
export class AppModule {}
