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
import { AllowStaff } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { assignedScopeFor } from '../auth/staff-scope';
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

  /**
   * Whoever calls this decides who a job belongs to, which is the hinge the whole STAFF assignee scope
   * hangs on — so it stays OWNER-only. A worker could otherwise assign themselves any job in the tenant
   * and read it legitimately from that point on.
   */
  @Post(':id/assign')
  assign(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: AssignDto,
  ): Promise<WorkItemView> {
    return this.workItems.assign(user.tenantId, id, dto.assignees);
  }

  /**
   * Throws 404 when a STAFF caller isn't assigned to this job; no-op for OWNER. The role guard only says
   * the route may be called — every per-job read/write below still has to prove the row is theirs.
   */
  private async assertJobVisible(user: AuthContext, jobId: string): Promise<void> {
    await this.workItems.get(user.tenantId, jobId, assignedScopeFor(user));
  }

  @AllowStaff()
  @Get(':id/notes')
  async listNotes(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<NoteView[]> {
    await this.assertJobVisible(user, id);
    return this.notes.list(user.tenantId, id);
  }

  @AllowStaff()
  @Post(':id/notes')
  async addNote(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: AddNoteDto,
  ): Promise<NoteView> {
    await this.assertJobVisible(user, id);
    return this.notes.add(user.tenantId, id, user.userId, dto.body);
  }

  @AllowStaff()
  @Get(':id/attachments')
  async listAttachments(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
  ): Promise<AttachmentView[]> {
    await this.assertJobVisible(user, id);
    return this.attachments.list(user.tenantId, id);
  }

  /** The worker's before/after photos on their own job. */
  @AllowStaff()
  @Post(':id/attachments')
  async addAttachment(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: AddAttachmentDto,
  ): Promise<AttachmentView> {
    await this.assertJobVisible(user, id);
    return this.attachments.add(user.tenantId, id, user.userId, dto);
  }

  /** Stream the raw image bytes back (tenant-scoped). Client renders thumbnail/full-size from this. */
  @AllowStaff()
  @Get(':id/attachments/:attachmentId/content')
  async content(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ): Promise<void> {
    // getContent resolves by attachmentId alone, so without this a STAFF caller who guessed an id could
    // pull photo bytes from a job that isn't theirs.
    await this.assertJobVisible(user, id);
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
