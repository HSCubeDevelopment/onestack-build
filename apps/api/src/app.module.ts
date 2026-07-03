import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { ContactsModule } from './contacts/contacts.module';
import { HealthController } from './health/health.controller';
import { TenantModule } from './tenancy/tenant.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TenantModule, // global: PrismaService (admin) + TenantService (app_user wrapper)
    AuthModule, // global: JwtAuthGuard + RolesGuard
    ContactsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
