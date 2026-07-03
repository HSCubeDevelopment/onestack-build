import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { FeatureFlagService } from './feature-flag.service';
import { ModuleKey } from './module-registry';
import { REQUIRE_FEATURE } from './require-feature.decorator';

/**
 * Server-side feature enforcement (card #6.2). If a route's module is OFF for the caller's tenant, the
 * route responds 404 — a disabled module must not be reachable, and we don't leak that it exists.
 * Runs after JwtAuthGuard, so req.auth.tenantId is set.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly flags: FeatureFlagService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const key = this.reflector.getAllAndOverride<ModuleKey | undefined>(REQUIRE_FEATURE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!key) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const tenantId = req.auth?.tenantId;
    if (!tenantId) throw new NotFoundException();

    if (!(await this.flags.isEnabled(tenantId, key))) {
      throw new NotFoundException(); // module off → behave as if the route doesn't exist
    }
    return true;
  }
}
