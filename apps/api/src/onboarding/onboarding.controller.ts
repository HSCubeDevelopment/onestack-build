import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ImportContactsDto } from './dto/onboarding.dto';
import { ImportResult, OnboardingChecklist, OnboardingService } from './onboarding.service';

/**
 * Onboarding & data migration — owner (card #152). Import existing customers from CSV (preview with
 * dryRun, then confirm) and read the setup checklist that guides the shop to first value. Tenant-scoped.
 */
@Controller('onboarding')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post('import/contacts')
  importContacts(
    @CurrentUser() user: AuthContext,
    @Body() dto: ImportContactsDto,
  ): Promise<ImportResult> {
    return this.onboarding.importContacts(user.tenantId, dto);
  }

  @Get('checklist')
  checklist(@CurrentUser() user: AuthContext): Promise<OnboardingChecklist> {
    return this.onboarding.checklist(user.tenantId);
  }
}
