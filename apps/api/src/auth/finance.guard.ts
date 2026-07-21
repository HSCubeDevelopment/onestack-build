import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Financials access control (40.8). Gates the money surface: an OWNER always passes; a STAFF member
 * passes only if the owner granted them `canViewFinance`. Runs after JwtAuthGuard (req.auth is set).
 *
 * The grant is read from the membership row per-request (NOT from the JWT) so revoking access takes
 * effect immediately, without waiting for the member's token to expire. Privileged read on the admin
 * connection, like the login membership bootstrap — there is no tenant context to scope by yet here and
 * the lookup is keyed by (tenantId, userId) from the verified token.
 */
@Injectable()
export class FinanceGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const auth = req.auth;
    if (!auth) throw new ForbiddenException('Not authenticated');
    if (auth.role === 'OWNER') return true;
    const membership = await this.prisma.membership.findFirst({
      where: { tenantId: auth.tenantId, userId: auth.userId },
      select: { canViewFinance: true },
    });
    if (!membership?.canViewFinance) {
      throw new ForbiddenException('You do not have finance access');
    }
    return true;
  }
}
