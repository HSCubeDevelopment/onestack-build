import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { DamageScopeService, DamageScopeView } from './damage-scope.service';
import { EditDamageScopeDto } from './dto/damage-scope.dto';

/**
 * AI photo-to-quote — damage scope (Phase 2 flagship, slice A). Generate a draft scope from a job's
 * photos, read it, edit it, discard it. Generation and the scope hang off the job; edit/delete address
 * the scope by id. Every route is tenant-scoped by the service. Nothing here sends or orders anything —
 * the scope is an editable draft the estimator confirms before it's priced (slice B).
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class DamageScopeController {
  constructor(private readonly scopes: DamageScopeService) {}

  @Post('work-items/:jobId/ai-scope')
  generate(
    @CurrentUser() user: AuthContext,
    @Param('jobId') jobId: string,
  ): Promise<DamageScopeView> {
    return this.scopes.generate(user.tenantId, jobId);
  }

  @Get('work-items/:jobId/ai-scope')
  getForJob(
    @CurrentUser() user: AuthContext,
    @Param('jobId') jobId: string,
  ): Promise<DamageScopeView> {
    return this.scopes.getForJob(user.tenantId, jobId);
  }

  @Patch('ai-scope/:id')
  edit(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: EditDamageScopeDto,
  ): Promise<DamageScopeView> {
    return this.scopes.edit(user.tenantId, id, dto);
  }

  @Delete('ai-scope/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<void> {
    return this.scopes.remove(user.tenantId, id);
  }
}
