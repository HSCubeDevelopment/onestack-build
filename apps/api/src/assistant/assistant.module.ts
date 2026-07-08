import { Module } from '@nestjs/common';
import { ContactsModule } from '../contacts/contacts.module';
import { WorkItemModule } from '../work-items/work-item.module';
import { AnthropicAssistantAdapter } from './anthropic-assistant-adapter';
import { ASSISTANT_ADAPTER, AssistantAdapter } from './assistant-adapter';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { StubAssistantAdapter } from './stub-assistant-adapter';

/**
 * AI assistant / receptionist (Phase 3). Provider-abstracted gateway: real Anthropic Claude when
 * ANTHROPIC_API_KEY is set, deterministic stub otherwise — so it works with NO external API in the MVP.
 * Reuses WorkItemModule + ContactsModule to validate optional job/customer context; TenantService is
 * global. Every answer is a DRAFT staff review before sending; telephony receptionist is a deferred vendor.
 */
@Module({
  imports: [WorkItemModule, ContactsModule],
  controllers: [AssistantController],
  providers: [
    AssistantService,
    {
      provide: ASSISTANT_ADAPTER,
      useFactory: (): AssistantAdapter => {
        const key = process.env.ANTHROPIC_API_KEY;
        return key ? new AnthropicAssistantAdapter(key) : new StubAssistantAdapter();
      },
    },
  ],
})
export class AssistantModule {}
