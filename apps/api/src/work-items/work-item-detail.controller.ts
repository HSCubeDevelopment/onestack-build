import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AttachmentService, AttachmentView } from './attachment.service';
import { AddAttachmentDto, AddNoteDto, AssignDto } from './dto/work-item.dto';
import { NoteService, NoteView } from './note.service';
import { WorkItemService, WorkItemView } from './work-item.service';

/**
 * Card #21: assign staff, notes & photos on a work item. All routes hang off /work-items/:id so the
 * job stays the aggregate root. Assignment reuses the generic assignees array; the automotive pack
 * labels it "Technician". Everything is tenant-scoped by the services.
 */
@Controller('work-items')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkItemDetailController {
  constructor(
    private readonly workItems: WorkItemService,
    private readonly notes: NoteService,
    private readonly attachments: AttachmentService,
  ) {}

  @Post(':id/assign')
  assign(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: AssignDto,
  ): Promise<WorkItemView> {
    return this.workItems.assign(user.tenantId, id, dto.assignees);
  }

  @Get(':id/notes')
  listNotes(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<NoteView[]> {
    return this.notes.list(user.tenantId, id);
  }

  @Post(':id/notes')
  addNote(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: AddNoteDto,
  ): Promise<NoteView> {
    return this.notes.add(user.tenantId, id, user.userId, dto.body);
  }

  @Get(':id/attachments')
  listAttachments(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
  ): Promise<AttachmentView[]> {
    return this.attachments.list(user.tenantId, id);
  }

  @Post(':id/attachments')
  addAttachment(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: AddAttachmentDto,
  ): Promise<AttachmentView> {
    return this.attachments.add(user.tenantId, id, user.userId, dto);
  }

  /** Stream the raw image bytes back (tenant-scoped). Client renders thumbnail/full-size from this. */
  @Get(':id/attachments/:attachmentId/content')
  async content(
    @CurrentUser() user: AuthContext,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { bytes, contentType, fileName } = await this.attachments.getContent(
      user.tenantId,
      attachmentId,
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${fileName.replace(/"/g, '')}"`);
    res.send(bytes);
  }

  @Delete(':id/attachments/:attachmentId')
  @HttpCode(204)
  async removeAttachment(
    @CurrentUser() user: AuthContext,
    @Param('attachmentId') attachmentId: string,
  ): Promise<void> {
    await this.attachments.remove(user.tenantId, attachmentId);
  }
}
