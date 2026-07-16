import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TenantService } from '../tenancy/tenant.service';
import { signPayload, subscribes } from './webhooks';

export interface WebhookEndpointView {
  id: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  createdAt: string;
}

export interface DeliveryView {
  id: string;
  eventType: string;
  status: 'success' | 'failed';
  responseCode: number | null;
  error: string | null;
  createdAt: string;
}

const TIMEOUT_MS = 5000;

/**
 * Public API & webhooks (Phase 4, card #252) — the webhooks half. GENERIC core (Platform). Partners
 * register an endpoint + which events; we POST signed payloads to it (our own outbound HTTP — no vendor).
 * Every delivery is logged. `dispatch` is available for other modules to fire domain events. Tenant-scoped.
 * (Partner API keys are an auth change — off-limits, handled separately.)
 */
@Injectable()
export class WebhooksService {
  constructor(private readonly tenants: TenantService) {}

  async create(tenantId: string, url: string, events?: string[]): Promise<WebhookEndpointView> {
    const secret = `whsec_${randomUUID().replace(/-/g, '')}`;
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const row = await tx.webhookEndpoint.create({
        data: {
          tenantId,
          url,
          secret,
          events: (events && events.length ? events : ['*']) as unknown as object,
        },
      });
      return toView(row);
    });
  }

  async list(tenantId: string): Promise<WebhookEndpointView[]> {
    const rows = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.webhookEndpoint.findMany({ orderBy: { createdAt: 'desc' } }),
    );
    return rows.map(toView);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.tenants.runInTenant(tenantId, (tx) =>
      tx.webhookEndpoint.deleteMany({ where: { id } }),
    );
  }

  async deliveries(tenantId: string, id: string): Promise<DeliveryView[]> {
    const rows = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.webhookDelivery.findMany({
        where: { endpointId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    );
    return rows.map(deliveryView);
  }

  /** Send a test event to one endpoint (proves the URL + signature work). */
  async test(tenantId: string, id: string): Promise<DeliveryView> {
    const ep = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.webhookEndpoint.findFirst({ where: { id } }),
    );
    if (!ep) throw new NotFoundException('Webhook endpoint not found');
    const result = await this.send(ep.url, ep.secret, 'ping', { message: 'OneStack webhook test' });
    return this.log(tenantId, id, 'ping', result);
  }

  /**
   * Fire a domain event to every active endpoint subscribed to it. Returns how many were delivered.
   * Other modules can call this to emit events; failures are logged, never thrown.
   */
  async dispatch(tenantId: string, eventType: string, payload: unknown): Promise<number> {
    const endpoints = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.webhookEndpoint.findMany({ where: { active: true } }),
    );
    let delivered = 0;
    for (const ep of endpoints) {
      if (!subscribes(ep.events, eventType)) continue;
      const result = await this.send(ep.url, ep.secret, eventType, payload);
      await this.log(tenantId, ep.id, eventType, result);
      if (result.status === 'success') delivered++;
    }
    return delivered;
  }

  private async send(
    url: string,
    secret: string,
    eventType: string,
    payload: unknown,
  ): Promise<{ status: 'success' | 'failed'; responseCode: number | null; error: string | null }> {
    const body = JSON.stringify({ event: eventType, data: payload, at: undefined });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-onestack-event': eventType,
          'x-onestack-signature': signPayload(secret, body),
        },
        body,
        signal: controller.signal,
      });
      return {
        status: res.ok ? 'success' : 'failed',
        responseCode: res.status,
        error: res.ok ? null : `HTTP ${res.status}`,
      };
    } catch (e) {
      return {
        status: 'failed',
        responseCode: null,
        error: e instanceof Error ? e.message : 'delivery failed',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private async log(
    tenantId: string,
    endpointId: string,
    eventType: string,
    result: { status: 'success' | 'failed'; responseCode: number | null; error: string | null },
  ): Promise<DeliveryView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const row = await tx.webhookDelivery.create({
        data: {
          tenantId,
          endpointId,
          eventType,
          status: result.status,
          responseCode: result.responseCode,
          error: result.error,
        },
      });
      return deliveryView(row);
    });
  }
}

function toView(r: {
  id: string;
  url: string;
  secret: string;
  events: unknown;
  active: boolean;
  createdAt: Date;
}): WebhookEndpointView {
  return {
    id: r.id,
    url: r.url,
    secret: r.secret,
    events: Array.isArray(r.events) ? (r.events as string[]) : ['*'],
    active: r.active,
    createdAt: r.createdAt.toISOString(),
  };
}
function deliveryView(r: {
  id: string;
  eventType: string;
  status: string;
  responseCode: number | null;
  error: string | null;
  createdAt: Date;
}): DeliveryView {
  return {
    id: r.id,
    eventType: r.eventType,
    status: r.status as 'success' | 'failed',
    responseCode: r.responseCode,
    error: r.error,
    createdAt: r.createdAt.toISOString(),
  };
}
