import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { QuoteDecisionDto } from './dto/portal.dto';
import { PortalHome, PortalService } from './portal.service';

/**
 * PUBLIC customer portal (card #150) — NO auth guard: the passwordless page the tokenised link opens. The
 * token is the credential; it's resolved to the tenant + customer via the BYPASSRLS admin connection
 * (never a client id), and everything is filtered to that one customer. The customer can approve/decline
 * their own Sent quotes. Online payments are deferred (invoices are read-only here).
 */
@Controller('public/portal')
export class PublicPortalController {
  constructor(private readonly portal: PortalService) {}

  @Get(':token')
  home(@Param('token') token: string): Promise<PortalHome> {
    return this.portal.home(token);
  }

  @Post(':token/quotes/:quoteId/decision')
  decideQuote(
    @Param('token') token: string,
    @Param('quoteId') quoteId: string,
    @Body() dto: QuoteDecisionDto,
  ): Promise<{ status: string }> {
    return this.portal.decideQuote(token, quoteId, dto.decision);
  }
}
