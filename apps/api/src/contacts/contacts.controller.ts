import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SubjectService, SubjectView } from '../subjects/subject.service';
import { ContactMergeService, MergeResult } from './contact-merge.service';
import { ContactsService, ContactView } from './contacts.service';
import { DuplicateGroup } from './duplicates';
import { CreateContactDto } from './dto/create-contact.dto';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

/**
 * Customer (Contact) API for the automotive vertical (card #10). Contact is core; Vehicle is a pack
 * Subject type, added as a sub-resource. The tenant always comes from the verified token — a caller can
 * never act on another tenant (guard + RLS).
 */
@Controller('contacts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ContactsController {
  constructor(
    private readonly contacts: ContactsService,
    private readonly subjects: SubjectService,
    private readonly merges: ContactMergeService,
  ) {}

  @Post()
  create(@CurrentUser() user: AuthContext, @Body() dto: CreateContactDto): Promise<ContactView> {
    return this.contacts.create(user.tenantId, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthContext, @Query('q') q?: string): Promise<ContactView[]> {
    return q ? this.contacts.search(user.tenantId, q) : this.contacts.list(user.tenantId);
  }

  // Owner-only route — demonstrates RBAC gating (card #3). Declared BEFORE :id so it isn't matched as one.
  @Get('owner-only')
  @Roles('OWNER')
  ownerOnly(): { ok: true } {
    return { ok: true };
  }

  // Duplicate detection (read-only). Declared BEFORE :id so it isn't matched as one (card #200).
  @Get('duplicates')
  duplicates(@CurrentUser() user: AuthContext): Promise<DuplicateGroup[]> {
    return this.merges.duplicates(user.tenantId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<ContactView> {
    return this.contacts.get(user.tenantId, id);
  }

  /**
   * Merge a duplicate contact INTO a primary (card #200). DESTRUCTIVE + PII: repoints the duplicate's
   * records onto the primary and soft-deletes the duplicate (reversible). OWNER-only.
   */
  @Post(':id/merge/:duplicateId')
  @Roles('OWNER')
  merge(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Param('duplicateId') duplicateId: string,
  ): Promise<MergeResult> {
    return this.merges.merge(user.tenantId, id, duplicateId, user.userId);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateContactDto,
  ): Promise<ContactView> {
    return this.contacts.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<void> {
    await this.contacts.softDelete(user.tenantId, id);
  }

  @Post(':id/vehicles')
  addVehicle(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: CreateVehicleDto,
  ): Promise<SubjectView> {
    return this.subjects.create(user.tenantId, {
      type: 'vehicle',
      label: `${dto.make} ${dto.model} (${dto.rego})`,
      fields: { rego: dto.rego, vin: dto.vin, make: dto.make, model: dto.model, year: dto.year },
      customFields: dto.customFields,
      contactId: id,
    });
  }

  @Get(':id/vehicles')
  vehicles(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<SubjectView[]> {
    return this.subjects.listForContact(user.tenantId, id);
  }
}
