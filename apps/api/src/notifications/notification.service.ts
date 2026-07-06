import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantClient, TenantService } from '../tenancy/tenant.service';

export type Channel = 'in_app' | 'email' | 'sms';

export interface NotificationInput {
  tenantId: string;
  channel: Channel;
  recipient: string;
  template: string;
  payload?: Record<string, unknown>;
}

/** A channel transport. Throwing marks the notification failed (for retry/inspection). */
export interface ChannelSender {
  channel: Channel;
  send(n: { recipient: string; template: string; payload: Record<string, unknown> }): Promise<void>;
}

/**
 * Notifications engine (card #9.1): any module can enqueue internal or customer notifications across
 * channels. Delivery is pluggable per channel — in-app is delivered by persistence; email/sms are stubs
 * until a provider is wired (no auto-send of AI content; these are system messages). Tenant-scoped.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly senders = new Map<Channel, ChannelSender>();

  constructor(private readonly tenants: TenantService) {
    // Defaults. in_app = no external transport (the row IS the notification). email/sms = stubs.
    this.registerSender({ channel: 'in_app', send: async () => {} });
    this.registerSender({
      channel: 'email',
      send: async (n) => this.logger.log(`[stub email] ${n.recipient}: ${n.template}`),
    });
    this.registerSender({
      channel: 'sms',
      send: async (n) => this.logger.log(`[stub sms] ${n.recipient}: ${n.template}`),
    });
  }

  registerSender(sender: ChannelSender): void {
    this.senders.set(sender.channel, sender);
  }

  /** Enqueue within an existing tenant transaction (atomic with the triggering change). */
  async enqueueIn(tx: TenantClient, input: NotificationInput): Promise<string> {
    const row = await tx.notification.create({
      data: {
        tenantId: input.tenantId,
        channel: input.channel,
        recipient: input.recipient,
        template: input.template,
        payload: (input.payload ?? {}) as Prisma.InputJsonValue,
      },
    });
    return row.id;
  }

  async enqueue(input: NotificationInput): Promise<string> {
    return this.tenants.runInTenant(input.tenantId, (tx) => this.enqueueIn(tx, input));
  }

  /** Deliver a tenant's pending notifications through their channel senders. */
  async deliverPending(tenantId: string, limit = 50): Promise<{ sent: number; failed: number }> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const pending = await tx.notification.findMany({ where: { status: 'pending' }, take: limit });
      let sent = 0;
      let failed = 0;
      for (const n of pending) {
        const sender = this.senders.get(n.channel as Channel);
        try {
          if (!sender) throw new Error(`No sender for channel "${n.channel}"`);
          await sender.send({
            recipient: n.recipient,
            template: n.template,
            payload: n.payload as Record<string, unknown>,
          });
          await tx.notification.update({
            where: { id: n.id },
            data: { status: 'sent', sentAt: new Date() },
          });
          sent++;
        } catch (err) {
          await tx.notification.update({
            where: { id: n.id },
            data: { status: 'failed', error: String(err).slice(0, 1000) },
          });
          failed++;
        }
      }
      return { sent, failed };
    });
  }
}
