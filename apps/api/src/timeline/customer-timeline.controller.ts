import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CustomerTimelineService, CustomerTimelineView } from './customer-timeline.service';

/**
 * Customer timeline (Phase 3). One chronological activity feed per customer — jobs + their notes, with
 * quote/invoice money summaries. Read-only, tenant-scoped by the service.
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomerTimelineController {
  constructor(private readonly timeline: CustomerTimelineService) {}

  @Get('contacts/:id/timeline')
  get(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<CustomerTimelineView> {
    return this.timeline.build(user.tenantId, id);
  }
}
