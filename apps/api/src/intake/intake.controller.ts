import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CreateIntakeFormDto, SubmitIntakeDto, UpdateIntakeFormDto } from './dto/intake.dto';
import { IntakeFormView, IntakeService, IntakeSubmissionView } from './intake.service';

/**
 * Digital intake & forms (Phase 3). Manage the form catalogue, submit a completed form against a
 * customer (answers land on the customer record), and read a customer's submissions. Tenant-scoped by
 * the service. The public self-service link is a follow-up (reuses the lead-form public + spam pattern).
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class IntakeController {
  constructor(private readonly intake: IntakeService) {}

  @Post('intake-forms')
  create(
    @CurrentUser() user: AuthContext,
    @Body() dto: CreateIntakeFormDto,
  ): Promise<IntakeFormView> {
    return this.intake.createForm(user.tenantId, dto.name, dto.fields);
  }

  @Get('intake-forms')
  list(@CurrentUser() user: AuthContext): Promise<IntakeFormView[]> {
    return this.intake.listForms(user.tenantId);
  }

  @Get('intake-forms/:id')
  get(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<IntakeFormView> {
    return this.intake.getForm(user.tenantId, id);
  }

  @Patch('intake-forms/:id')
  update(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateIntakeFormDto,
  ): Promise<IntakeFormView> {
    return this.intake.updateForm(user.tenantId, id, dto);
  }

  @Post('contacts/:contactId/intake/:formId')
  submit(
    @CurrentUser() user: AuthContext,
    @Param('contactId') contactId: string,
    @Param('formId') formId: string,
    @Body() dto: SubmitIntakeDto,
  ): Promise<IntakeSubmissionView> {
    return this.intake.submit(user.tenantId, contactId, formId, dto.answers, user.userId);
  }

  @Get('contacts/:contactId/intake-submissions')
  submissions(
    @CurrentUser() user: AuthContext,
    @Param('contactId') contactId: string,
  ): Promise<IntakeSubmissionView[]> {
    return this.intake.submissionsForContact(user.tenantId, contactId);
  }
}
