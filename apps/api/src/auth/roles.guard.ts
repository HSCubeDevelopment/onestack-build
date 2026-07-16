import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AppRole } from './auth.types';
import { ROLES_KEY } from './roles.decorator';

/**
 * The roles an undecorated route requires. OWNER-only: the employee (STAFF) surface is an explicit
 * allowlist, so forgetting a decorator fails CLOSED (staff get 403) instead of leaking the business.
 */
const DEFAULT_ROLES: AppRole[] = ['OWNER'];

/**
 * RBAC (card #3): gates a route by role. Runs after JwtAuthGuard, so req.auth is set.
 *
 * Deny-by-default: a guarded route with no @Roles/@AllowStaff decorator is OWNER-only. Opt employees in
 * per route with @AllowStaff(). Routes that don't apply this guard at all (login, /health, public/*)
 * are unaffected.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const declared = this.reflector.getAllAndOverride<AppRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const required = declared && declared.length > 0 ? declared : DEFAULT_ROLES;
    const req = context.switchToHttp().getRequest<Request>();
    const role = req.auth?.role;
    if (!role || !required.includes(role)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
