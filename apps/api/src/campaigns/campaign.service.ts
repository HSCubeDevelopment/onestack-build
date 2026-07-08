import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TagService } from '../tags/tag.service';
import { TenantService } from '../tenancy/tenant.service';
import { CampaignChannel, isChannel, selectRecipients } from './campaign';
import { CAMPAIGN_SENDER, CampaignSender, SendResult } from './campaign-sender';

export interface CampaignView {
  id: string;
  name: string;
  channel: CampaignChannel;
  subject: string | null;
  body: string;
  tagId: string | null;
  status: 'draft' | 'sent';
  recipientCount: number | null;
  sentAt: string | null;
}

export interface CreateCampaignInput {
  name: string;
  channel: CampaignChannel;
  subject?: string;
  body?: string;
  tagId?: string | null;
}

export interface UpdateCampaignInput {
  name?: string;
  channel?: CampaignChannel;
  subject?: string | null;
  body?: string;
  tagId?: string | null;
}

/**
 * Marketing campaigns (Phase 3). A shop writes a one-shot email/SMS message, targets a tag/segment, and
 * sends it. The audience is resolved through TagService (the segment's contacts reachable on the channel);
 * delivery goes through a vendor boundary (no-op until an email/SMS provider is wired, so nothing is
 * auto-sent). Tenant-scoped via the wrapper. Drip sequences + win-back are a follow-up.
 */
@Injectable()
export class CampaignService {
  constructor(
    private readonly tenants: TenantService,
    private readonly tags: TagService,
    @Inject(CAMPAIGN_SENDER) private readonly sender: CampaignSender,
  ) {}

  async create(tenantId: string, input: CreateCampaignInput): Promise<CampaignView> {
    const name = input.name?.trim();
    if (!name) throw new BadRequestException('name is required');
    if (!isChannel(input.channel)) throw new BadRequestException('channel must be email or sms');
    if (input.tagId) await this.tags.contactsForTag(tenantId, input.tagId); // 404s for a bad/other-tenant tag
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const row = await tx.campaign.create({
        data: {
          tenantId,
          name,
          channel: input.channel,
          subject: input.subject?.trim() || null,
          body: input.body ?? '',
          tagId: input.tagId ?? null,
        },
      });
      return toView(row);
    });
  }

  async list(tenantId: string): Promise<CampaignView[]> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const rows = await tx.campaign.findMany({ orderBy: { createdAt: 'desc' } });
      return rows.map(toView);
    });
  }

  async get(tenantId: string, id: string): Promise<CampaignView> {
    const row = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.campaign.findFirst({ where: { id } }),
    );
    if (!row) throw new NotFoundException('Campaign not found');
    return toView(row);
  }

  async update(tenantId: string, id: string, patch: UpdateCampaignInput): Promise<CampaignView> {
    if (patch.channel !== undefined && !isChannel(patch.channel))
      throw new BadRequestException('channel must be email or sms');
    if (patch.tagId) await this.tags.contactsForTag(tenantId, patch.tagId);
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const row = await tx.campaign.findFirst({ where: { id } });
      if (!row) throw new NotFoundException('Campaign not found');
      if (row.status !== 'draft') throw new ConflictException('A sent campaign cannot be edited');
      const updated = await tx.campaign.update({
        where: { id },
        data: {
          ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
          ...(patch.channel !== undefined ? { channel: patch.channel } : {}),
          ...(patch.subject !== undefined ? { subject: patch.subject?.trim() || null } : {}),
          ...(patch.body !== undefined ? { body: patch.body } : {}),
          ...(patch.tagId !== undefined ? { tagId: patch.tagId } : {}),
        },
      });
      return toView(updated);
    });
  }

  /** The recipients this campaign would reach — the segment's contacts with an address for the channel. */
  async audience(
    tenantId: string,
    id: string,
  ): Promise<{
    channel: CampaignChannel;
    recipientCount: number;
    recipients: { contactId: string; displayName: string; address: string }[];
  }> {
    const campaign = await this.get(tenantId, id);
    const recipients = await this.resolveRecipients(tenantId, campaign.channel, campaign.tagId);
    return { channel: campaign.channel, recipientCount: recipients.length, recipients };
  }

  /**
   * Send the campaign — the vendor boundary. Resolves the audience, hands it to the sender (no-op until a
   * provider is wired), and — only if delivery actually happened — marks it sent with the recipient count.
   */
  async send(
    tenantId: string,
    id: string,
  ): Promise<{ campaign: CampaignView; result: SendResult }> {
    const campaign = await this.get(tenantId, id);
    if (campaign.status !== 'draft') throw new ConflictException('Campaign has already been sent');
    const recipients = await this.resolveRecipients(tenantId, campaign.channel, campaign.tagId);
    if (recipients.length === 0)
      throw new BadRequestException('No reachable recipients in the selected segment');

    const result = await this.sender.send({
      channel: campaign.channel,
      subject: campaign.subject,
      body: campaign.body,
      recipients,
    });

    if (result.delivered) {
      const updated = await this.tenants.runInTenant(tenantId, async (tx) => {
        await tx.campaign.update({
          where: { id },
          data: { status: 'sent', recipientCount: result.sentCount, sentAt: new Date() },
        });
        return tx.campaign.findFirst({ where: { id } });
      });
      return { campaign: toView(updated!), result };
    }
    return { campaign, result };
  }

  private async resolveRecipients(
    tenantId: string,
    channel: CampaignChannel,
    tagId: string | null,
  ) {
    if (!tagId) return [];
    const contacts = await this.tags.contactsForTag(tenantId, tagId);
    return selectRecipients(contacts, channel);
  }
}

function toView(row: {
  id: string;
  name: string;
  channel: string;
  subject: string | null;
  body: string;
  tagId: string | null;
  status: string;
  recipientCount: number | null;
  sentAt: Date | null;
}): CampaignView {
  return {
    id: row.id,
    name: row.name,
    channel: row.channel as CampaignChannel,
    subject: row.subject,
    body: row.body,
    tagId: row.tagId,
    status: row.status as 'draft' | 'sent',
    recipientCount: row.recipientCount,
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
  };
}
