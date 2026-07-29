import { Body, Controller, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AllowStaff } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateTicketDto, ExtractTicketDto, UpdateTicketDto } from './dto/ticket.dto';
import { TicketExtractResult, TicketsService, TicketView } from './tickets.service';

/**
 * Tickets — capture an infringement / police notice against a car (employee flow). @AllowStaff, like the
 * rest of the on-the-floor surface: any worker can photograph or upload a notice and file it. `extract`
 * runs AI over the file(s) and returns an editable DRAFT — it saves nothing; `create` persists only the
 * details a human confirmed. Money/status changes stay simple status transitions, not payments.
 */
@Controller('tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  /** Upload/capture files → AI-extracted draft fields. Nothing is stored. */
  @AllowStaff()
  @Post('extract')
  extract(@Body() dto: ExtractTicketDto): Promise<TicketExtractResult> {
    return this.tickets.extract(dto.files);
  }

  /** Save the confirmed ticket (+ optionally its original file). */
  @AllowStaff()
  @Post()
  create(@CurrentUser() user: AuthContext, @Body() dto: CreateTicketDto): Promise<TicketView> {
    return this.tickets.create(user.tenantId, user.userId, dto);
  }

  /** List tickets, newest first — optionally by rego and/or status. */
  @AllowStaff()
  @Get()
  list(
    @CurrentUser() user: AuthContext,
    @Query('rego') rego?: string,
    @Query('status') status?: string,
  ): Promise<TicketView[]> {
    return this.tickets.list(user.tenantId, { rego, status });
  }

  @AllowStaff()
  @Get(':id')
  get(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<TicketView> {
    return this.tickets.get(user.tenantId, id);
  }

  /** Mark a ticket paid / disputed / cancelled. */
  @AllowStaff()
  @Patch(':id')
  update(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateTicketDto,
  ): Promise<TicketView> {
    return this.tickets.updateStatus(user.tenantId, id, dto.status);
  }

  /** Stream the original notice (image or PDF), verified to belong to the caller's tenant. */
  @AllowStaff()
  @Get(':id/file')
  async file(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { bytes, contentType } = await this.tickets.fileContent(user.tenantId, id);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'inline');
    res.send(bytes);
  }
}
