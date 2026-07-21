import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { FinanceGuard } from '../auth/finance.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MoneyOverview } from './finance';
import { InvoiceService } from './invoice.service';

/**
 * Money & Payments (FIN-1). Gated by FinanceGuard (40.8): an OWNER always, plus any STAFF member the
 * owner has granted `canViewFinance`. Money stays hidden from everyone else.
 */
@Controller('finance')
@UseGuards(JwtAuthGuard, FinanceGuard)
export class FinanceController {
  constructor(private readonly invoices: InvoiceService) {}

  @Get('overview')
  overview(@CurrentUser() user: AuthContext): Promise<MoneyOverview> {
    return this.invoices.financeOverview(user.tenantId);
  }
}
