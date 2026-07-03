import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Admin/owner connection (DATABASE_URL — Supabase `postgres`, which has BYPASSRLS).
 * Used ONLY for privileged, non-request work: migrations, tenant provisioning, and the RLS CI check.
 * Request-path queries must NEVER use this — they go through TenantService (app_user + RLS).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
