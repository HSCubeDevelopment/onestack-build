import { Global, Module } from '@nestjs/common';
import { DevLoginController } from './dev-login.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginController } from './login.controller';
import { RolesGuard } from './roles.guard';
import { SupabaseAuthService } from './supabase-auth.service';

@Global()
@Module({
  controllers: [DevLoginController, LoginController],
  providers: [JwtAuthGuard, RolesGuard, SupabaseAuthService],
  exports: [JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
