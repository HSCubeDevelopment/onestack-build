import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import type { AppRole, AuthContext } from './auth.types';

/**
 * Verifies a Supabase Auth JWT and resolves the tenant + role from its claims (card #3).
 *
 * We do NOT hand-roll login/password/MFA — that is Supabase Auth (managed). This guard only:
 *   - verifies the token signature + expiry against SUPABASE_JWT_SECRET, and
 *   - extracts `sub` (user), `tenant_id` and `role` (stamped by the custom access-token hook).
 *
 * "Users log into their tenant only" is enforced downstream: the tenantId used for every query comes
 * from this verified token, and Postgres RLS rejects anything outside it.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = header.slice('Bearer '.length);

    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret) {
      // Fail closed: never treat an unconfigured verifier as "authenticated".
      throw new UnauthorizedException('Auth is not configured');
    }

    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, secret) as jwt.JwtPayload;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const userId = payload.sub;
    const tenantId = payload['tenant_id'] as string | undefined;
    const role = payload['role'] as AppRole | undefined;

    if (!userId || !tenantId || (role !== 'OWNER' && role !== 'STAFF' && role !== 'TOW')) {
      throw new UnauthorizedException('Token is missing tenant/role claims');
    }

    const auth: AuthContext = { userId, tenantId, role };
    req.auth = auth;
    return true;
  }
}
