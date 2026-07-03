import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuthModule } from './auth/auth.module';
import { ContactsModule } from './contacts/contacts.module';
import { CoreModule } from './core/core.module';
import { HealthController } from './health/health.controller';
import { SubjectModule } from './subjects/subject.module';
import { TenantModule } from './tenancy/tenant.module';
import { WorkItemModule } from './work-items/work-item.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(), // workflow side-effect actions are emitted here
    TenantModule, // global: PrismaService (admin) + TenantService (app_user wrapper)
    AuthModule, // global: JwtAuthGuard + RolesGuard
    CoreModule, // global: PackRegistry + WorkflowEngine
    ContactsModule,
    WorkItemModule,
    SubjectModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
