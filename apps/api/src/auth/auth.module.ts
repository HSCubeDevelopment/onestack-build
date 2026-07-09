import { Global, Module } from '@nestjs/common';
import { DevLoginController } from './dev-login.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

@Global()
@Module({
  controllers: [DevLoginController],
  providers: [JwtAuthGuard, RolesGuard],
  exports: [JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
