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
import { QuoteView } from '../quotes/quote.service';
import { AddScopePartDto, EditScopePartDto } from './dto/scope-part.dto';
import { ScopePartService, ScopePartView } from './scope-part.service';

/**
 * AI photo-to-quote — parts list (Phase 2 flagship, slice B). Derive an editable parts list from a job's
 * damage scope, adjust/price it, then build a Draft quote from it. The parts list hangs off the job; a
 * part is addressed by id for edit/delete. Every route is tenant-scoped by the service. Nothing here
 * sends or orders anything — building a quote produces a Draft a human reviews.
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ScopePartController {
  constructor(private readonly parts: ScopePartService) {}

  @Post('work-items/:jobId/parts-list')
  generate(
    @CurrentUser() user: AuthContext,
    @Param('jobId') jobId: string,
  ): Promise<ScopePartView[]> {
    return this.parts.generateFromScope(user.tenantId, jobId);
  }

  @Get('work-items/:jobId/parts-list')
  list(@CurrentUser() user: AuthContext, @Param('jobId') jobId: string): Promise<ScopePartView[]> {
    return this.parts.listForJob(user.tenantId, jobId);
  }

  @Post('work-items/:jobId/parts')
  add(
    @CurrentUser() user: AuthContext,
    @Param('jobId') jobId: string,
    @Body() dto: AddScopePartDto,
  ): Promise<ScopePartView> {
    return this.parts.addPart(user.tenantId, jobId, dto);
  }

  @Patch('parts/:id')
  edit(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: EditScopePartDto,
  ): Promise<ScopePartView> {
    return this.parts.editPart(user.tenantId, id, dto);
  }

  @Delete('parts/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<void> {
    return this.parts.removePart(user.tenantId, id);
  }

  /** Build a Draft quote from the fully-priced parts list (through the shared Quote engine). */
  @Post('work-items/:jobId/parts-list/quote')
  buildQuote(@CurrentUser() user: AuthContext, @Param('jobId') jobId: string): Promise<QuoteView> {
    return this.parts.buildQuote(user.tenantId, jobId);
  }
}
