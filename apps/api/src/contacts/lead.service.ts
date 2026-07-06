import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationService } from '../notifications/notification.service';
import { TenantService } from '../tenancy/tenant.service';
import { ContactsService } from './contacts.service';
import { LeadFormService } from './lead-form.service';

export type LeadStatus = 'New' | 'Contacted' | 'Converted';

export interface LeadView {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  message: string | null;
  vehicleInfo: string | null;
  source: string;
  status: LeadStatus;
  convertedContactId: string | null;
  createdAt: Date;
}

export interface PublicLeadInput {
  name: string;
  phone: string;
  email?: string;
  message?: string;
  vehicleInfo?: string;
  website?: string; // honeypot — must be empty for a human
}

// Allowed forward-only moves. Conversion goes through convert(), not setStatus.
const NEXT: Record<LeadStatus, LeadStatus[]> = {
  New: ['Contacted'],
  Contacted: ['Converted'],
  Converted: [],
};

/**
 * Inbound leads (card #12). Public submissions are UNTRUSTED: a honeypot field drops obvious bots, all
 * input is validated, and the shop is notified. A lead converts into a Contact (the shared core record).
 * Everything is tenant-scoped; the public path scopes by resolving the form token to its tenant first.
 */
@Injectable()
export class LeadService {
  constructor(
    private readonly tenants: TenantService,
    private readonly forms: LeadFormService,
    private readonly contacts: ContactsService,
    private readonly notifications: NotificationService,
  ) {}

  /** Public form submission (no auth). Silently drops honeypot hits; otherwise creates + notifies. */
  async submitPublic(token: string, input: PublicLeadInput): Promise<{ received: true }> {
    // Honeypot: a bot fills the hidden `website` field. Accept (200) but do nothing — don't tip it off.
    if (input.website && input.website.trim().length > 0) return { received: true };
    if (!input.name?.trim() || !input.phone?.trim())
      throw new BadRequestException('name and phone are required');

    const resolved = await this.forms.resolvePublic(token);
    if (!resolved) throw new NotFoundException('Form not found');

    const lead = await this.tenants.runInTenant(resolved.tenantId, (tx) =>
      tx.lead.create({
        data: {
          tenantId: resolved.tenantId,
          formId: resolved.formId,
          name: input.name.trim(),
          phone: input.phone.trim(),
          email: input.email?.trim() || null,
          message: input.message?.trim() || null,
          vehicleInfo: input.vehicleInfo?.trim() || null,
          source: 'web_form',
          status: 'New',
        },
      }),
    );

    // Notify the shop (in-app now; email/SMS is the comms card). Best-effort — never fail the submit.
    try {
      await this.notifications.enqueue({
        tenantId: resolved.tenantId,
        channel: 'in_app',
        recipient: resolved.tenantId,
        template: 'lead.received',
        payload: { leadId: lead.id, name: lead.name, phone: lead.phone },
      });
    } catch {
      /* notification failure must not break public capture */
    }
    return { received: true };
  }

  async list(tenantId: string, status?: LeadStatus): Promise<LeadView[]> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const rows = await tx.lead.findMany({
        where: { ...(status ? { status } : {}) },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toLeadView);
    });
  }

  async get(tenantId: string, id: string): Promise<LeadView> {
    const lead = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.lead.findFirst({ where: { id } }),
    );
    if (!lead) throw new NotFoundException('Lead not found');
    return toLeadView(lead);
  }

  async setStatus(tenantId: string, id: string, status: LeadStatus): Promise<LeadView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const lead = await tx.lead.findFirst({ where: { id } });
      if (!lead) throw new NotFoundException('Lead not found');
      if (status === 'Converted')
        throw new BadRequestException('Use convert to mark a lead Converted');
      if (!NEXT[lead.status as LeadStatus].includes(status))
        throw new ConflictException(`Cannot move a ${lead.status} lead to ${status}`);
      await tx.lead.update({ where: { id }, data: { status } });
      return toLeadView({ ...lead, status });
    });
  }

  /**
   * Convert a lead into a Customer (Contact). Idempotency: a lead can only convert once. Creating a job
   * is left to the pack/frontend (the core has no job concept) — the returned contactId is the handle.
   */
  async convert(tenantId: string, id: string): Promise<{ lead: LeadView; contactId: string }> {
    const lead = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.lead.findFirst({ where: { id } }),
    );
    if (!lead) throw new NotFoundException('Lead not found');
    if (lead.status === 'Converted' && lead.convertedContactId)
      throw new ConflictException('Lead is already converted');

    const contact = await this.contacts.create(tenantId, {
      displayName: lead.name,
      phone: lead.phone,
      email: lead.email ?? undefined,
    });

    const updated = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.lead.update({
        where: { id },
        data: { status: 'Converted', convertedContactId: contact.id },
      }),
    );
    return { lead: toLeadView(updated), contactId: contact.id };
  }
}

function toLeadView(l: {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  message: string | null;
  vehicleInfo: string | null;
  source: string;
  status: string;
  convertedContactId: string | null;
  createdAt: Date;
}): LeadView {
  return {
    id: l.id,
    name: l.name,
    phone: l.phone,
    email: l.email,
    message: l.message,
    vehicleInfo: l.vehicleInfo,
    source: l.source,
    status: l.status as LeadStatus,
    convertedContactId: l.convertedContactId,
    createdAt: l.createdAt,
  };
}
