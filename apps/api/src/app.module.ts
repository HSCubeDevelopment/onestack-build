import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CompositionModule } from './composition/composition.module';
import { ContactsModule } from './contacts/contacts.module';
import { CoreModule } from './core/core.module';
import { EventingModule } from './eventing/eventing.module';
import { HealthController } from './health/health.controller';
import { JobsModule } from './jobs/jobs.module';
import { ModulesModule } from './modules/modules.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { SubjectModule } from './subjects/subject.module';
import { TenantModule } from './tenancy/tenant.module';
import { WorkItemModule } from './work-items/work-item.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(), // workflow side-effect actions are emitted here
    TenantModule, // global: PrismaService (admin) + TenantService (app_user wrapper)
    AuthModule, // global: JwtAuthGuard + RolesGuard
    JobsModule, // global: BackgroundJobRunner (tenant-context wrapper for jobs)
    EventingModule, // global: EventBus + OutboxService + OutboxRelay (durable eventing backbone)
    AuditModule, // global: AuditService (append-only who-did-what trail)
    NotificationsModule, // global: NotificationService (multi-channel)
    CompositionModule, // global: FeatureFlagService + FeatureGuard + EventBus
    ModulesModule, // global: ModuleCatalog (dependency graph — valid provisioning combos)
    CoreModule, // global: PackRegistry + WorkflowEngine
    ContactsModule,
    SchedulingModule, // toggleable module (OFF by default) — demonstrates feature enforcement
    WorkItemModule,
    SubjectModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
