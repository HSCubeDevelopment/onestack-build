import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AssistantMessageView, AssistantService } from './assistant.service';
import { AskAssistantDto } from './dto/assistant.dto';

/**
 * AI assistant / receptionist — owner (Phase 3). Ask a question and get an AI-DRAFTED reply (real Claude
 * when a key is set, deterministic stub otherwise) that staff review before sending — nothing auto-sends.
 * Also lists the recent ask/answer log. Tenant-scoped. Phone/telephony receptionist is a deferred vendor.
 */
@Controller('ai-assistant')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Post('ask')
  ask(
    @CurrentUser() user: AuthContext,
    @Body() dto: AskAssistantDto,
  ): Promise<AssistantMessageView> {
    return this.assistant.ask(
      user.tenantId,
      {
        question: dto.question,
        context: dto.context,
        workItemId: dto.workItemId,
        contactId: dto.contactId,
      },
      user.userId,
    );
  }

  @Get('messages')
  messages(@CurrentUser() user: AuthContext): Promise<AssistantMessageView[]> {
    return this.assistant.list(user.tenantId);
  }
}
