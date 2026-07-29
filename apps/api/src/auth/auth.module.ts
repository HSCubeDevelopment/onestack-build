import { Global, Module } from '@nestjs/common';
import { DevLoginController } from './dev-login.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginController } from './login.controller';
import { MeController } from './me.controller';
import { PinAuthService } from './pin-auth.service';
import { PinController } from './pin.controller';
import { RolesGuard } from './roles.guard';
import { SupabaseAuthService } from './supabase-auth.service';

@Global()
@Module({
  controllers: [DevLoginController, LoginController, PinController, MeController],
  providers: [JwtAuthGuard, RolesGuard, SupabaseAuthService, PinAuthService],
  exports: [JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
