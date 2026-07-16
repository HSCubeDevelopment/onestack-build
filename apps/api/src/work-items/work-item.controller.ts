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
import { AllowStaff } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { assignedScopeFor } from '../auth/staff-scope';
import { SubjectView } from '../subjects/subject.service';
import { SubjectService } from '../subjects/subject.service';
import { CreateWorkItemDto, TransitionDto, UpdateWorkItemDto } from './dto/work-item.dto';
import { WorkItemService, WorkItemView } from './work-item.service';

/**
 * Generic Work Item API (core). In the automotive pack a Work Item of type "job" is a repair job: the
 * "J-" number, the Booked→…→Collected workflow, and the "requires a car" rule all come from pack config —
 * the endpoints here are type-agnostic. State only ever changes via /transition (the workflow engine).
 */
@Controller('work-items')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkItemController {
  constructor(
    private readonly workItems: WorkItemService,
    private readonly subjects: SubjectService,
  ) {}

  /**
   * A worker photographing a car creates the job here. Force STAFF-created jobs to be assigned to their
   * creator: the assignee scope would otherwise hide the job the moment it's made, and it stops a worker
   * from creating work assigned to someone else.
   */
  @AllowStaff()
  @Post()
  create(@CurrentUser() user: AuthContext, @Body() dto: CreateWorkItemDto): Promise<WorkItemView> {
    const input = user.role === 'STAFF' ? { ...dto, assignees: [user.userId] } : dto;
    return this.workItems.create(user.tenantId, input);
  }

  /** STAFF only ever receive jobs they're assigned to; OWNER sees the tenant's whole list. */
  @AllowStaff()
  @Get()
  list(@CurrentUser() user: AuthContext, @Query('type') type?: string): Promise<WorkItemView[]> {
    return this.workItems.list(user.tenantId, type, assignedScopeFor(user));
  }

  /** The "job card": the work item + its linked subjects (e.g. the vehicle) pulled in automatically. */
  @AllowStaff()
  @Get(':id')
  async get(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
  ): Promise<WorkItemView & { subjects: SubjectView[] }> {
    // Resolve the work item FIRST: for STAFF this 404s unless the job is theirs, so an unassigned job's
    // subjects (the customer's vehicle) are never fetched, let alone returned.
    const wi = await this.workItems.get(user.tenantId, id, assignedScopeFor(user));
    const subjects = await this.subjects.listForWorkItem(user.tenantId, id);
    return { ...wi, subjects };
  }

  /**
   * OWNER only. `update` can rewrite `assignees`, so exposing it to STAFF would let a worker attach
   * themselves to any job and walk straight through the assignee scope. Workers change a job's status
   * via /transition instead.
   */
  @Patch(':id')
  update(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateWorkItemDto,
  ): Promise<WorkItemView> {
    return this.workItems.update(user.tenantId, id, dto);
  }

  /** Move a job along the workflow. STAFF may only transition a job assigned to them. */
  @AllowStaff()
  @Post(':id/transition')
  async transition(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: TransitionDto,
  ): Promise<WorkItemView> {
    // 404s for a STAFF caller who isn't assigned — the guard allows the route, this allows the row.
    await this.workItems.get(user.tenantId, id, assignedScopeFor(user));
    return this.workItems.transition(user.tenantId, id, dto.event);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<void> {
    await this.workItems.softDelete(user.tenantId, id);
  }
}
