import { Injectable } from '@nestjs/common';
import { CityTagConnector, CityTagCreds, TagLocation } from './citytag.connector';

/**
 * Live-location for fleet cars (migration plan §9, Phase 2). Resolves the CALLING tenant's CityTag
 * account, asks the connector for a car's last-known position, and always answers with a small,
 * tenant-safe shape. A tag/location is only ever resolved for the tenant whose credentials match — one
 * shop can never read another's tags.
 *
 * Credentials are per-tenant (never global): `CITYTAG__<tenantId>__USER/PASS`, with the bare
 * `CITYTAG_USER/PASS` accepted ONLY for the demo tenant (the single demo shop). With no credentials the
 * feature reports "not configured" and the UI shows its empty state — no fabricated positions, ever.
 * Every device shown is a real, live fix pulled from the shop's own CityTag account.
 */
export interface TrackingResult {
  configured: boolean;
  device: TagLocation | null;
  error?: string;
}

@Injectable()
export class TrackingService {
  constructor(private readonly citytag: CityTagConnector) {}

  async locate(tenantId: string, rego: string): Promise<TrackingResult> {
    const creds = this.resolveCreds(tenantId);
    if (!creds) return { configured: false, device: null };
    try {
      const device = await this.citytag.getLocation(creds, rego);
      return { configured: true, device };
    } catch (e) {
      return { configured: true, device: null, error: (e as Error)?.message };
    }
  }

  /** Per-tenant credentials; the bare env vars only stand in for the demo tenant. */
  private resolveCreds(tenantId: string): CityTagCreds | null {
    const key = tenantId.replace(/-/g, '');
    const username = process.env[`CITYTAG__${key}__USER`];
    const password = process.env[`CITYTAG__${key}__PASS`];
    if (username && password) return { username, password };

    const demoTenant = process.env.DEMO_TENANT_ID ?? '0d15ea5e-0000-4000-8000-000000000001';
    if (tenantId === demoTenant && process.env.CITYTAG_USER && process.env.CITYTAG_PASS) {
      return { username: process.env.CITYTAG_USER, password: process.env.CITYTAG_PASS };
    }
    return null;
  }
}
