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
    // Fail closed on the two misconfigurations that silently disable tenant isolation.
    //
    // Unset: Prisma falls back to the schema's env("DATABASE_URL") — the migration/owner role, which
    // has BYPASSRLS. Every request-path query would then bypass RLS entirely, with nothing logged.
    // Identical to DATABASE_URL: same outcome, reached by a copy-paste in an env file.
    const appUrl = process.env.APP_DATABASE_URL;
    if (!appUrl) {
      throw new Error(
        'APP_DATABASE_URL is not set. Without it Prisma falls back to DATABASE_URL (the BYPASSRLS ' +
          'owner role) for every request-path query, which disables tenant isolation.',
      );
    }
    if (appUrl === process.env.DATABASE_URL) {
      throw new Error(
        'APP_DATABASE_URL must not equal DATABASE_URL. The request path has to connect as a ' +
          'NOSUPERUSER, NOBYPASSRLS role or RLS is not enforced.',
      );
    }

    // app_user connection. Keep the pool small so the leak test exercises connection reuse.
    this.app = new PrismaClient({
      datasourceUrl: appUrl,
    });
  }

  /**
   * On a long-running server, connect and prove the role at boot — fail fast, before any traffic.
   *
   * On serverless neither can happen at boot. A cold start that cannot reach the pooler takes the
   * whole instance down, so every route on it answers 500 (twelve concurrent cold starts reproduced
   * this: four served, eight failed). The privilege check is NOT skipped there — it moves to the
   * first tenant query instead, which is the thing it actually has to gate. No tenant query can run
   * without it having passed either way.
   */
  async onModuleInit(): Promise<void> {
    if (this.serverless) return;
    await this.app.$connect();
    await this.assertNotPrivileged();
  }

  private get serverless(): boolean {
    return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  }

  /** Memoised privilege check. A FAILED check is never cached as passed — it retries next call. */
  private privilegeCheck: Promise<void> | null = null;

  private ensureNotPrivileged(): Promise<void> {
    this.privilegeCheck ??= this.assertNotPrivileged().catch((e: unknown) => {
      this.privilegeCheck = null;
      throw e;
    });
    return this.privilegeCheck;
  }

  /**
   * RLS is only a guarantee if the role we connect as cannot step over it. A correct-looking
   * connection string pointed at a privileged role would make every policy in the database
   * decorative, so prove the role's attributes at boot rather than trusting the URL.
   */
  private async assertNotPrivileged(): Promise<void> {
    const rows = await this.app.$queryRaw<
      { rolsuper: boolean; rolbypassrls: boolean; rolname: string }[]
    >`SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    const role = rows[0];
    if (!role) return; // Cannot read pg_roles — leave the connection to speak for itself.
    if (role.rolsuper || role.rolbypassrls) {
      throw new Error(
        `APP_DATABASE_URL connects as "${role.rolname}", which is ` +
          `${role.rolsuper ? 'a SUPERUSER' : 'BYPASSRLS'}. Row-level security would not be ` +
          'enforced on the request path. Use the least-privilege app_user role.',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    // A serverless instance is frozen, not shut down; disconnecting a client that may serve the next
    // invocation just pays the handshake again.
    if (this.serverless) return;
    await this.app.$disconnect();
  }

  /** Run `fn` with tenant RLS context set. All queries MUST use the passed `tx` client. */
  async runInTenant<T>(tenantId: string, fn: (tx: TenantClient) => Promise<T>): Promise<T> {
    // The role must be proven non-privileged before ANY tenant query. On a server this already
    // happened at boot and resolves instantly; on serverless this is where it happens. Either way no
    // tenant data is read or written until it has passed.
    await this.ensureNotPrivileged();
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
