import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

export type TenantClient = Prisma.TransactionClient;

/**
 * THE central tenant-context wrapper (cards #2 / #2.1). The most important code in the product.
 * OFF-LIMITS to change without senior review.
 *
 * Every request-path query runs through `runInTenant`, which:
 *   1. opens a Prisma interactive transaction (one dedicated connection for its lifetime), and
 *   2. sets `app.current_tenant_id` with `set_config(..., true)` — the `true` = LOCAL flag, so the
 *      setting is scoped to THIS transaction and is discarded on commit/rollback.
 *
 * This is what makes tenant isolation pooled-connection-safe: because the setting is transaction-LOCAL,
 * a connection returned to the pool never carries a tenant id into the next request. A plain session
 * `SET` would leak across requests sharing a pooled connection — the #1 way multi-tenant SaaS leaks data.
 *
 * The app connects as `app_user` (NOSUPERUSER, NOBYPASSRLS), so Postgres RLS is the real guarantee
 * underneath this wrapper — not the app code.
 */
@Injectable()
export class TenantService implements OnModuleInit, OnModuleDestroy {
  private readonly app: PrismaClient;

  constructor() {
    // app_user connection. Keep the pool small so the leak test exercises connection reuse.
    this.app = new PrismaClient({
      datasourceUrl: process.env.APP_DATABASE_URL,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.app.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.app.$disconnect();
  }

  /** Run `fn` with tenant RLS context set. All queries MUST use the passed `tx` client. */
  async runInTenant<T>(tenantId: string, fn: (tx: TenantClient) => Promise<T>): Promise<T> {
    return this.app.$transaction(
      async (tx) => {
        // Parameterised — set_config's value arg is text; tenantId is a uuid string.
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
        return fn(tx);
      },
      // Allow the request to queue for a pooled connection rather than failing fast under load.
      { maxWait: 15_000, timeout: 20_000 },
    );
  }

  /**
   * Test/diagnostic helper: read the tenant id currently visible on a fresh checkout from the pool.
   * After `runInTenant` commits, this MUST be empty — proving the LOCAL setting did not leak to the
   * session/pooled connection. Used by the pooled-connection-leak test.
   */
  async currentTenantIdOutsideTransaction(): Promise<string> {
    const rows = await this.app.$queryRaw<
      { v: string }[]
    >`SELECT current_setting('app.current_tenant_id', true) AS v`;
    return rows[0]?.v ?? '';
  }

  /** Escape hatch for tests only: raw access to the app_user client (no tenant context). */
  get unsafeAppClient(): PrismaClient {
    return this.app;
  }
}
