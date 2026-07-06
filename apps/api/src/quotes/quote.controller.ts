import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AddQuoteLineDto, EditQuoteLineDto } from './dto/quote-line.dto';
import { QuoteService, QuoteView } from './quote.service';

/** Quote API (card #30). A quote hangs off a job; line items reuse the shared money engine (#6.9/#29). */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class QuoteController {
  constructor(private readonly quotes: QuoteService) {}

  @Post('work-items/:jobId/quotes')
  create(@CurrentUser() user: AuthContext, @Param('jobId') jobId: string): Promise<QuoteView> {
    return this.quotes.create(user.tenantId, jobId);
  }

  @Get('work-items/:jobId/quotes')
  listForJob(
    @CurrentUser() user: AuthContext,
    @Param('jobId') jobId: string,
  ): Promise<QuoteView[]> {
    return this.quotes.listForJob(user.tenantId, jobId);
  }

  @Get('quotes/:id')
  get(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<QuoteView> {
    return this.quotes.get(user.tenantId, id);
  }

  @Post('quotes/:id/lines')
  addLine(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: AddQuoteLineDto,
  ): Promise<QuoteView> {
    return this.quotes.addLine(user.tenantId, id, dto);
  }

  @Patch('quotes/:id/lines/:lineId')
  editLine(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() dto: EditQuoteLineDto,
  ): Promise<QuoteView> {
    return this.quotes.editLine(user.tenantId, id, lineId, dto);
  }

  @Delete('quotes/:id/lines/:lineId')
  removeLine(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
  ): Promise<QuoteView> {
    return this.quotes.removeLine(user.tenantId, id, lineId);
  }
}
