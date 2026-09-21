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
  // SupabaseAuthService is exported for its profile lookup only (user id -> name/email), which the tow
  // booking form needs so drivers are listed by name instead of a truncated uuid. It is read-only and
  // already reachable to everything in this module; nothing about how auth decisions are made moves.
  exports: [JwtAuthGuard, RolesGuard, SupabaseAuthService],
})
export class AuthModule {}
