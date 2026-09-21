import { afterEach, describe, expect, it } from 'vitest';
import { PinAuthService } from './pin-auth.service';

/**
 * The gate that decides whether a PIN is checked at sign-in.
 *
 * Switching PIN checks off is a local convenience for reviewing what each role sees. These tests exist
 * so it can never become the production answer by accident: every case below asserts that the door
 * stays SHUT unless all three conditions are deliberately set, and the last one is the one that matters
 * most — production wins over everything.
 */
const KEYS = ['NODE_ENV', 'DEV_LOGIN_ENABLED', 'AUTH_PINS_REQUIRED'] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

function env(vals: Partial<Record<(typeof KEYS)[number], string | undefined>>): void {
  for (const k of KEYS) {
    const v = vals[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

afterEach(() => {
  for (const k of KEYS) {
    const v = saved[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('PinAuthService.pinsRequired', () => {
  it('requires a PIN when nothing is configured', () => {
    env({});
    expect(PinAuthService.pinsRequired()).toBe(true);
  });

  it('requires a PIN in production even when told not to', () => {
    env({
      NODE_ENV: 'production',
      DEV_LOGIN_ENABLED: 'true',
      AUTH_PINS_REQUIRED: 'false',
    });
    expect(PinAuthService.pinsRequired()).toBe(true);
  });

  it('requires a PIN when dev login is off, whatever AUTH_PINS_REQUIRED says', () => {
    env({ NODE_ENV: 'development', DEV_LOGIN_ENABLED: undefined, AUTH_PINS_REQUIRED: 'false' });
    expect(PinAuthService.pinsRequired()).toBe(true);
  });

  it('requires a PIN unless the opt-out is the exact string "false"', () => {
    for (const v of [undefined, 'true', '0', 'no', 'False', 'FALSE', '']) {
      env({ NODE_ENV: 'development', DEV_LOGIN_ENABLED: 'true', AUTH_PINS_REQUIRED: v });
      expect(PinAuthService.pinsRequired(), `AUTH_PINS_REQUIRED=${String(v)}`).toBe(true);
    }
  });

  it('opens only when all three are deliberately set', () => {
    env({ NODE_ENV: 'development', DEV_LOGIN_ENABLED: 'true', AUTH_PINS_REQUIRED: 'false' });
    expect(PinAuthService.pinsRequired()).toBe(false);
  });
});

describe('openLogin', () => {
  it('refuses while PINs are required, without touching Supabase', async () => {
    env({});
    // Both collaborators are deliberately objects that throw if touched: the guard must refuse BEFORE
    // any lookup, so a misconfigured deployment cannot be probed for valid user ids.
    const boom = new Proxy(
      {},
      {
        get() {
          throw new Error('openLogin reached a collaborator before checking the gate');
        },
      },
    );
    const svc = new PinAuthService(boom as never, boom as never);
    await expect(svc.openLogin('0d15ea5e-0000-4000-8000-000000000002')).rejects.toThrow(
      /PIN sign-in is required/,
    );
  });
});
