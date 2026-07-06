import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CreateLeadFormDto, SetLeadFormEnabledDto, SetLeadStatusDto } from './dto/lead.dto';
import { LeadFormService, LeadFormView } from './lead-form.service';
import { LeadService, LeadStatus, LeadView } from './lead.service';

/**
 * Shop-side leads & forms (card #12) — authenticated. Create/list the public forms, then work the Leads
 * list: New → Contacted → Converted (convert creates a Customer). Everything tenant-scoped.
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeadController {
  constructor(
    private readonly leads: LeadService,
    private readonly forms: LeadFormService,
  ) {}

  @Post('lead-forms')
  createForm(
    @CurrentUser() user: AuthContext,
    @Body() dto: CreateLeadFormDto,
  ): Promise<LeadFormView> {
    return this.forms.create(user.tenantId, dto.name);
  }

  @Get('lead-forms')
  listForms(@CurrentUser() user: AuthContext): Promise<LeadFormView[]> {
    return this.forms.list(user.tenantId);
  }

  @Patch('lead-forms/:id')
  setFormEnabled(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: SetLeadFormEnabledDto,
  ): Promise<LeadFormView> {
    return this.forms.setEnabled(user.tenantId, id, dto.enabled);
  }

  @Get('leads')
  listLeads(
    @CurrentUser() user: AuthContext,
    @Query('status') status?: LeadStatus,
  ): Promise<LeadView[]> {
    return this.leads.list(user.tenantId, status);
  }

  @Get('leads/:id')
  getLead(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<LeadView> {
    return this.leads.get(user.tenantId, id);
  }

  @Patch('leads/:id/status')
  setStatus(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: SetLeadStatusDto,
  ): Promise<LeadView> {
    return this.leads.setStatus(user.tenantId, id, dto.status);
  }

  @Post('leads/:id/convert')
  convert(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
  ): Promise<{ lead: LeadView; contactId: string }> {
    return this.leads.convert(user.tenantId, id);
  }
}
