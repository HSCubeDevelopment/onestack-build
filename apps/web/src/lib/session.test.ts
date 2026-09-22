import { afterEach, describe, expect, it } from 'vitest';
import { devIdentityAllowed, mintDevToken } from './session';

/**
 * The gate that stops a deployed build from handing every anonymous visitor an OWNER token.
 *
 * The API proxy and the root layout both fall back to a demo OWNER identity when nobody is signed in.
 * On a laptop that is a convenience. On a public URL it is the whole app — customers, jobs, money —
 * open to anyone with the link. These tests hold the fallback shut everywhere except a dev machine
 * that has explicitly asked for it.
 */
const KEYS = [
  'NODE_ENV',
  'DEV_LOGIN_ENABLED',
  'SUPABASE_JWT_SECRET',
  'DEMO_TENANT_ID',
  'DEMO_OWNER_USER_ID',
] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

function env(vals: Partial<Record<(typeof KEYS)[number], string | undefined>>): void {
  for (const k of KEYS) {
    const v = vals[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

/** Everything a dev token needs, so only the gate itself is under test. */
const CONFIGURED = {
  SUPABASE_JWT_SECRET: 'test-secret-not-a-real-key',
  DEMO_TENANT_ID: '0d15ea5e-0000-4000-8000-000000000001',
  DEMO_OWNER_USER_ID: '0d15ea5e-0000-4000-8000-000000000002',
};

afterEach(() => {
  for (const k of KEYS) {
    const v = saved[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('devIdentityAllowed', () => {
  it('is off in production even when dev login is switched on', () => {
    env({ NODE_ENV: 'production', DEV_LOGIN_ENABLED: 'true', ...CONFIGURED });
    expect(devIdentityAllowed()).toBe(false);
  });

  it('is off when nothing is configured', () => {
    env({});
    expect(devIdentityAllowed()).toBe(false);
  });

  it('is off unless DEV_LOGIN_ENABLED is exactly "true"', () => {
    for (const v of [undefined, 'false', '1', 'yes', 'TRUE', '']) {
      env({ NODE_ENV: 'development', DEV_LOGIN_ENABLED: v, ...CONFIGURED });
      expect(devIdentityAllowed(), `DEV_LOGIN_ENABLED=${String(v)}`).toBe(false);
    }
  });

  it('is on for a dev machine that asked for it', () => {
    env({ NODE_ENV: 'development', DEV_LOGIN_ENABLED: 'true', ...CONFIGURED });
    expect(devIdentityAllowed()).toBe(true);
  });
});

describe('mintDevToken', () => {
  it('mints nothing in production, even fully configured', () => {
    // This is the case that matters: a Vercel deploy carries the same env, so the ONLY thing standing
    // between an anonymous request and an owner token is NODE_ENV.
    env({ NODE_ENV: 'production', DEV_LOGIN_ENABLED: 'true', ...CONFIGURED });
    expect(mintDevToken()).toBeNull();
  });

  it('mints nothing when dev identity is not allowed', () => {
    env({ NODE_ENV: 'development', ...CONFIGURED });
    expect(mintDevToken()).toBeNull();
  });

  it('returns null rather than throwing when the env is incomplete', () => {
    // It used to throw here. A thrown error inside the proxy is a 500, which reads as "broken" and
    // invites someone to "fix" it by supplying the env — which would then mint tokens for the public.
    env({ NODE_ENV: 'development', DEV_LOGIN_ENABLED: 'true' });
    expect(mintDevToken()).toBeNull();
  });

  it('mints an OWNER token on an opted-in dev machine', () => {
    env({ NODE_ENV: 'development', DEV_LOGIN_ENABLED: 'true', ...CONFIGURED });
    const token = mintDevToken();
    expect(token).toBeTruthy();
    const claims = JSON.parse(
      Buffer.from(token!.split('.')[1]!, 'base64url').toString('utf8'),
    ) as Record<string, string>;
    expect(claims.role).toBe('OWNER');
    expect(claims.tenant_id).toBe(CONFIGURED.DEMO_TENANT_ID);
  });
});
