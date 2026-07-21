import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { beforeAll, describe, expect, it } from 'vitest';
import { AppRole } from './auth.types';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

const SECRET = 'test-secret';

function ctxWith(req: Record<string, unknown>, handlerRoles?: AppRole[]): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({ roles: handlerRoles }),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function sign(claims: Record<string, unknown>): string {
  return jwt.sign(claims, SECRET, { expiresIn: '5m' });
}

describe('JwtAuthGuard', () => {
  beforeAll(() => {
    process.env.SUPABASE_JWT_SECRET = SECRET;
  });

  const guard = new JwtAuthGuard();

  it('accepts a valid token and attaches auth context', () => {
    const token = sign({
      sub: '11111111-1111-1111-1111-111111111111',
      tenant_id: 'tA',
      role: 'STAFF',
    });
    const req: Record<string, unknown> = { headers: { authorization: `Bearer ${token}` } };
    expect(guard.canActivate(ctxWith(req))).toBe(true);
    expect(req.auth).toMatchObject({ tenantId: 'tA', role: 'STAFF' });
  });

  it('accepts a TOW token (301) — a first-class role, not just OWNER/STAFF', () => {
    const token = sign({ sub: 'tow-1', tenant_id: 'tA', role: 'TOW' });
    const req: Record<string, unknown> = { headers: { authorization: `Bearer ${token}` } };
    expect(guard.canActivate(ctxWith(req))).toBe(true);
    expect(req.auth).toMatchObject({ tenantId: 'tA', role: 'TOW' });
  });

  it('rejects a missing token', () => {
    expect(() => guard.canActivate(ctxWith({ headers: {} }))).toThrow();
  });

  it('rejects a token without tenant/role claims', () => {
    const token = sign({ sub: 'u1' });
    expect(() =>
      guard.canActivate(ctxWith({ headers: { authorization: `Bearer ${token}` } })),
    ).toThrow();
  });

  it('rejects a token signed with the wrong secret', () => {
    const token = jwt.sign({ sub: 'u1', tenant_id: 'tA', role: 'STAFF' }, 'wrong');
    expect(() =>
      guard.canActivate(ctxWith({ headers: { authorization: `Bearer ${token}` } })),
    ).toThrow();
  });
});

describe('RolesGuard', () => {
  // Stub reflector so the test controls the "required roles" for a route.
  const guardWith = (required?: AppRole[]): RolesGuard => {
    const reflector = { getAllAndOverride: () => required } as unknown as Reflector;
    return new RolesGuard(reflector);
  };

  // Deny-by-default is the whole point: an undecorated route is OWNER-only, so a controller added later
  // is closed to employees until someone decides otherwise. These two cases are the contract.
  it('defaults an undecorated route to OWNER-only — STAFF is denied', () => {
    expect(() => guardWith(undefined).canActivate(ctxWith({ auth: { role: 'STAFF' } }))).toThrow();
    expect(() => guardWith([]).canActivate(ctxWith({ auth: { role: 'STAFF' } }))).toThrow();
  });

  it('lets OWNER through an undecorated route', () => {
    expect(guardWith(undefined).canActivate(ctxWith({ auth: { role: 'OWNER' } }))).toBe(true);
    expect(guardWith([]).canActivate(ctxWith({ auth: { role: 'OWNER' } }))).toBe(true);
  });

  it('allows when the user has a required role', () => {
    expect(guardWith(['OWNER']).canActivate(ctxWith({ auth: { role: 'OWNER' } }))).toBe(true);
  });

  it('forbids when the user lacks the required role', () => {
    expect(() => guardWith(['OWNER']).canActivate(ctxWith({ auth: { role: 'STAFF' } }))).toThrow();
  });

  it('admits both roles to an @AllowStaff() route', () => {
    expect(guardWith(['OWNER', 'STAFF']).canActivate(ctxWith({ auth: { role: 'STAFF' } }))).toBe(
      true,
    );
    expect(guardWith(['OWNER', 'STAFF']).canActivate(ctxWith({ auth: { role: 'OWNER' } }))).toBe(
      true,
    );
  });

  it('forbids a request with no resolved role at all', () => {
    expect(() => guardWith(undefined).canActivate(ctxWith({}))).toThrow();
  });
});
