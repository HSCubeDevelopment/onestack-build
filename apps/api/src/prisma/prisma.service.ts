import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Admin/owner connection (DATABASE_URL — Supabase `postgres`, which has BYPASSRLS).
 * Used ONLY for privileged, non-request work: migrations, tenant provisioning, and the RLS CI check.
 * Request-path queries must NEVER use this — they go through TenantService (app_user + RLS).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PrismaService.name);

  /**
   * Connect eagerly on a long-running server, lazily on serverless.
   *
   * On a server, failing at boot is what you want: the process dies, the platform restarts it, and
   * nobody gets a half-working API. On serverless it is the opposite — a cold start that cannot reach
   * the database takes the WHOLE instance down, so every route on it answers 500, including /health
   * which touches no database at all. Twelve concurrent cold starts against Supabase's pooler
   * reproduced exactly that: four succeeded and eight returned 500.
   *
   * Prisma connects on first use anyway, so skipping the eager connect costs nothing but the fail-fast
   * behaviour — which is worth having on a server and actively harmful on a lambda.
   */
  async onModuleInit(): Promise<void> {
    if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) return;
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    // A serverless instance is frozen rather than shut down, and disconnecting a client that may be
    // reused on the next invocation just pays the handshake again.
    if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) return;
    await this.$disconnect().catch((e) => this.log.warn(`disconnect failed: ${String(e)}`));
  }
}
