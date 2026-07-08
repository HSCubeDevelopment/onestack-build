import { Controller, Delete, Param, Post, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PortalLink, PortalService } from './portal.service';

/**
 * Customer portal — owner (card #150). Issue or revoke a customer's passwordless portal link. Nothing is
 * sent — the owner shares the returned link. Tenant-scoped.
 */
@Controller('contacts/:contactId/portal-link')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Post()
  issue(
    @CurrentUser() user: AuthContext,
    @Param('contactId') contactId: string,
  ): Promise<PortalLink> {
    return this.portal.issueLink(user.tenantId, contactId, user.userId);
  }

  @Delete()
  revoke(
    @CurrentUser() user: AuthContext,
    @Param('contactId') contactId: string,
  ): Promise<{ revoked: true }> {
    return this.portal.revoke(user.tenantId, contactId);
  }
}
