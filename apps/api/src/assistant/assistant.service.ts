import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ContactsService } from '../contacts/contacts.service';
import { TenantService } from '../tenancy/tenant.service';
import { WorkItemService } from '../work-items/work-item.service';
import { ASSISTANT_ADAPTER, AssistantAdapter, MAX_QUESTION_CHARS } from './assistant-adapter';

export interface AssistantMessageView {
  id: string;
  workItemId: string | null;
  contactId: string | null;
  question: string;
  answer: string;
  model: string;
  draft: true;
  createdAt: string;
}

export interface AskInput {
  question: string;
  context?: string;
  workItemId?: string;
  contactId?: string;
}

/**
 * AI assistant (Phase 3). Drafts a reply to a customer question through the provider-abstracted gateway
 * (real Claude when a key is set, deterministic stub otherwise), and logs each ask + drafted answer. The
 * answer is always a DRAFT a human reviews before sending — nothing auto-sends. Optional job/customer
 * context is validated through the public services and used only to ground the draft. Tenant-scoped. The
 * phone/telephony "receptionist" is a deferred vendor.
 */
@Injectable()
export class AssistantService {
  constructor(
    private readonly tenants: TenantService,
    private readonly workItems: WorkItemService,
    private readonly contacts: ContactsService,
    @Inject(ASSISTANT_ADAPTER) private readonly adapter: AssistantAdapter,
  ) {}

  async ask(tenantId: string, input: AskInput, userId: string): Promise<AssistantMessageView> {
    const question = input.question?.trim();
    if (!question) throw new BadRequestException('question is required');
    if (question.length > MAX_QUESTION_CHARS)
      throw new BadRequestException(`question must be ${MAX_QUESTION_CHARS} characters or fewer`);
    if (input.workItemId) await this.workItems.get(tenantId, input.workItemId); // 404s for other-tenant
    if (input.contactId) await this.contacts.get(tenantId, input.contactId);

    let result;
    try {
      result = await this.adapter.answer({ question, context: input.context?.trim() || undefined });
    } catch (err) {
      throw new InternalServerErrorException(
        `AI assistant failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }

    return this.tenants.runInTenant(tenantId, async (tx) => {
      const row = await tx.assistantMessage.create({
        data: {
          tenantId,
          workItemId: input.workItemId ?? null,
          contactId: input.contactId ?? null,
          question,
          answer: result.answer,
          model: result.model,
          createdByUserId: userId,
        },
      });
      return toView(row);
    });
  }

  /** Recent ask/answer log (newest first). */
  async list(tenantId: string): Promise<AssistantMessageView[]> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const rows = await tx.assistantMessage.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      return rows.map(toView);
    });
  }
}

function toView(row: {
  id: string;
  workItemId: string | null;
  contactId: string | null;
  question: string;
  answer: string;
  model: string;
  createdAt: Date;
}): AssistantMessageView {
  return {
    id: row.id,
    workItemId: row.workItemId,
    contactId: row.contactId,
    question: row.question,
    answer: row.answer,
    model: row.model,
    draft: true,
    createdAt: row.createdAt.toISOString(),
  };
}
