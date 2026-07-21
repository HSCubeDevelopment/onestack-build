import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { MoneyOverview } from './finance';
import { InvoiceService } from './invoice.service';

/**
 * Money & Payments (FIN-1). OWNER-only by the RolesGuard default (no @AllowStaff) — money is hidden
 * from staff. There is no separate "finance" role today (OWNER/STAFF only); when finance.view lands
 * (card 40.8), widen this to that permission rather than to STAFF.
 */
@Controller('finance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinanceController {
  constructor(private readonly invoices: InvoiceService) {}

  @Get('overview')
  overview(@CurrentUser() user: AuthContext): Promise<MoneyOverview> {
    return this.invoices.financeOverview(user.tenantId);
  }
}
