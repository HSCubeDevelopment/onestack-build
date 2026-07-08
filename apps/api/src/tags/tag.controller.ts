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
import { AssignTagDto, CreateTagDto, UpdateTagDto } from './dto/tag.dto';
import { ContactSummary, TagService, TagView } from './tag.service';

/**
 * Segmentation & tagging (Phase 3). Manage the tag catalogue, assign/unassign tags on contacts, and read
 * a tag's contacts (its segment). All routes are tenant-scoped by the service. Generic CRM — no vertical
 * nouns. Nothing is sent; segments are read-models used for targeted comms/reporting downstream.
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class TagController {
  constructor(private readonly tags: TagService) {}

  @Post('tags')
  create(@CurrentUser() user: AuthContext, @Body() dto: CreateTagDto): Promise<TagView> {
    return this.tags.createTag(user.tenantId, dto.name, dto.color);
  }

  @Get('tags')
  list(@CurrentUser() user: AuthContext): Promise<TagView[]> {
    return this.tags.listTags(user.tenantId);
  }

  @Patch('tags/:id')
  update(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateTagDto,
  ): Promise<TagView> {
    return this.tags.updateTag(user.tenantId, id, dto);
  }

  @Delete('tags/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<void> {
    return this.tags.deleteTag(user.tenantId, id);
  }

  /** The contacts a tag groups — the segment. */
  @Get('tags/:id/contacts')
  contactsForTag(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
  ): Promise<ContactSummary[]> {
    return this.tags.contactsForTag(user.tenantId, id);
  }

  @Get('contacts/:contactId/tags')
  tagsForContact(
    @CurrentUser() user: AuthContext,
    @Param('contactId') contactId: string,
  ): Promise<TagView[]> {
    return this.tags.tagsForContact(user.tenantId, contactId);
  }

  @Post('contacts/:contactId/tags')
  @HttpCode(204)
  assign(
    @CurrentUser() user: AuthContext,
    @Param('contactId') contactId: string,
    @Body() dto: AssignTagDto,
  ): Promise<void> {
    return this.tags.assign(user.tenantId, contactId, dto.tagId);
  }

  @Delete('contacts/:contactId/tags/:tagId')
  @HttpCode(204)
  unassign(
    @CurrentUser() user: AuthContext,
    @Param('contactId') contactId: string,
    @Param('tagId') tagId: string,
  ): Promise<void> {
    return this.tags.unassign(user.tenantId, contactId, tagId);
  }
}
