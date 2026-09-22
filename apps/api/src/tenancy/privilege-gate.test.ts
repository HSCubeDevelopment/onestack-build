// The privilege check moved off boot for serverless. These tests hold the invariant it exists for:
// no tenant query runs until the connecting role has been PROVEN not to bypass RLS.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TenantService } from './tenant.service';

const APP_URL = 'postgresql://app_user:pw@pooler.example:6543/postgres';
const ADMIN_URL = 'postgresql://postgres:pw@db.example:5432/postgres';

const saved = { ...process.env };
afterEach(() => {
  for (const k of ['VERCEL', 'APP_DATABASE_URL', 'DATABASE_URL']) {
    const v = saved[k];
    if (v === undefined) delete (process.env as Record<string, string | undefined>)[k];
    else (process.env as Record<string, string | undefined>)[k] = v;
  }
  vi.restoreAllMocks();
});

/**
 * A TenantService whose app client is a stub, so the test is about ORDER OF OPERATIONS — was the role
 * proven before the transaction ran — not about Postgres.
 */
function serviceWith(roleRows: unknown[]) {
  const calls: string[] = [];
  (process.env as Record<string, string | undefined>).VERCEL = '1';
  (process.env as Record<string, string | undefined>).APP_DATABASE_URL = APP_URL;
  (process.env as Record<string, string | undefined>).DATABASE_URL = ADMIN_URL;

  const svc = new TenantService();
  const app = {
    $connect: vi.fn(),
    $disconnect: vi.fn(),
    $queryRaw: vi.fn(async () => {
      calls.push('privilege-check');
      return roleRows;
    }),
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      calls.push('transaction');
      return fn({ $executeRaw: vi.fn() });
    }),
  };
  // The constructor builds a real PrismaClient from the env; swap it for the stub.
  (svc as unknown as { app: unknown }).app = app;
  return { svc, app, calls };
}

const SAFE = [{ rolname: 'app_user', rolsuper: false, rolbypassrls: false }];
const BYPASSES_RLS = [{ rolname: 'postgres', rolsuper: false, rolbypassrls: true }];
const SUPERUSER = [{ rolname: 'postgres', rolsuper: true, rolbypassrls: false }];

describe('privilege check gates tenant queries', () => {
  it('proves the role BEFORE the first transaction', async () => {
    const { svc, calls } = serviceWith(SAFE);
    await svc.runInTenant('0d15ea5e-0000-4000-8000-000000000001', async () => 'done');
    expect(calls).toEqual(['privilege-check', 'transaction']);
  });

  it('refuses to run a tenant query when the role bypasses RLS', async () => {
    const { svc, app } = serviceWith(BYPASSES_RLS);
    await expect(svc.runInTenant('t', async () => 'nope')).rejects.toThrow(/BYPASSRLS/);
    // The important half: the transaction never started.
    expect(app.$transaction).not.toHaveBeenCalled();
  });

  it('refuses when the role is a superuser', async () => {
    const { svc, app } = serviceWith(SUPERUSER);
    await expect(svc.runInTenant('t', async () => 'nope')).rejects.toThrow(/SUPERUSER/);
    expect(app.$transaction).not.toHaveBeenCalled();
  });

  it('checks once, not on every query', async () => {
    const { svc, app } = serviceWith(SAFE);
    await svc.runInTenant('t', async () => 1);
    await svc.runInTenant('t', async () => 2);
    await svc.runInTenant('t', async () => 3);
    expect(app.$queryRaw).toHaveBeenCalledTimes(1);
    expect(app.$transaction).toHaveBeenCalledTimes(3);
  });

  it('does not cache a FAILED check as passed', async () => {
    // A dropped connection during the check must not leave the gate permanently open OR permanently
    // shut — the next call has to try again.
    const { svc, app } = serviceWith(SAFE);
    app.$queryRaw.mockRejectedValueOnce(new Error('connection reset'));
    await expect(svc.runInTenant('t', async () => 1)).rejects.toThrow(/connection reset/);
    await expect(svc.runInTenant('t', async () => 2)).resolves.toBe(2);
    expect(app.$queryRaw).toHaveBeenCalledTimes(2);
  });
});
