import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from './tenant.service';

@Global()
@Module({
  providers: [PrismaService, TenantService],
  exports: [PrismaService, TenantService],
})
export class TenantModule {}
