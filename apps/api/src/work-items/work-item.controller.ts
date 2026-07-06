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
import { RolesGuard } from '../auth/roles.guard';
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

  @Post()
  create(@CurrentUser() user: AuthContext, @Body() dto: CreateWorkItemDto): Promise<WorkItemView> {
    return this.workItems.create(user.tenantId, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthContext, @Query('type') type?: string): Promise<WorkItemView[]> {
    return this.workItems.list(user.tenantId, type);
  }

  /** The "job card": the work item + its linked subjects (e.g. the vehicle) pulled in automatically. */
  @Get(':id')
  async get(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
  ): Promise<WorkItemView & { subjects: SubjectView[] }> {
    const [wi, subjects] = await Promise.all([
      this.workItems.get(user.tenantId, id),
      this.subjects.listForWorkItem(user.tenantId, id),
    ]);
    return { ...wi, subjects };
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateWorkItemDto,
  ): Promise<WorkItemView> {
    return this.workItems.update(user.tenantId, id, dto);
  }

  @Post(':id/transition')
  transition(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: TransitionDto,
  ): Promise<WorkItemView> {
    return this.workItems.transition(user.tenantId, id, dto.event);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<void> {
    await this.workItems.softDelete(user.tenantId, id);
  }
}
