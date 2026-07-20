import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PipelineView } from './pipeline';
import { PipelineService } from './pipeline.service';

/**
 * Card 52.3. No @AllowStaff: this is the whole-shop operational picture, which the RBAC work put on the
 * owner side of the line (an employee sees their own jobs, not the board). Carries no money, so it does
 * not need card 40.8's finance gate.
 */
@Controller('pipeline')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PipelineController {
  constructor(private readonly pipeline: PipelineService) {}

  @Get()
  view(@CurrentUser() user: AuthContext, @Query('type') type?: string): Promise<PipelineView> {
    return this.pipeline.view(user.tenantId, type || 'job');
  }
}
