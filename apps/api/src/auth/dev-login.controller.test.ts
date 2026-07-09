import { ForbiddenException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DevLoginController } from './dev-login.controller';

const SECRET = 'test-secret';

describe('DevLoginController', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {
      DEV_LOGIN_ENABLED: process.env.DEV_LOGIN_ENABLED,
      NODE_ENV: process.env.NODE_ENV,
      SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET,
      DEMO_TENANT_ID: process.env.DEMO_TENANT_ID,
      DEMO_OWNER_USER_ID: process.env.DEMO_OWNER_USER_ID,
    };
    process.env.DEV_LOGIN_ENABLED = 'true';
    process.env.NODE_ENV = 'development';
    process.env.SUPABASE_JWT_SECRET = SECRET;
    process.env.DEMO_TENANT_ID = 'tenant-1';
    process.env.DEMO_OWNER_USER_ID = 'user-1';
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('mints a token with the exact claims the guard expects', () => {
    const res = new DevLoginController().devLogin({});
    expect(res.user).toEqual({ userId: 'user-1', tenantId: 'tenant-1', role: 'OWNER' });
    const payload = jwt.verify(res.token, SECRET) as jwt.JwtPayload;
    expect(payload.sub).toBe('user-1');
    expect(payload['tenant_id']).toBe('tenant-1');
    expect(payload['role']).toBe('OWNER');
  });

  it('honours body overrides (tenant/user/role)', () => {
    const res = new DevLoginController().devLogin({ tenantId: 't2', userId: 'u2', role: 'STAFF' });
    expect(res.user).toEqual({ userId: 'u2', tenantId: 't2', role: 'STAFF' });
  });

  it('is forbidden when the flag is off', () => {
    process.env.DEV_LOGIN_ENABLED = 'false';
    expect(() => new DevLoginController().devLogin({})).toThrow(ForbiddenException);
  });

  it('is forbidden in production even with the flag on', () => {
    process.env.NODE_ENV = 'production';
    expect(() => new DevLoginController().devLogin({})).toThrow(ForbiddenException);
  });

  it('is forbidden when the secret/identity is not configured', () => {
    delete process.env.SUPABASE_JWT_SECRET;
    expect(() => new DevLoginController().devLogin({})).toThrow(ForbiddenException);
  });
});
