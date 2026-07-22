import { Injectable, Logger } from '@nestjs/common';

/**
 * Anti-corruption layer around CityTag's undocumented web backstage (migration plan §9).
 *
 * CityTag has no official API, but its backstage (citytag.yuminstall.top) is a normal web app. This
 * connector logs in with an account's credentials (passed in — never global, never in code), reads the
 * tags' last-known GPS, and returns ONLY the shaped fields below. Secrets in the raw payload (privatekey,
 * mac, tokens) never leave this file. Ported field-for-field from the source in-n-out `/api/citytag`.
 *
 * The endpoint is fragile (undocumented, can change without notice), so it lives behind this single class
 * with a stable internal interface and degrades gracefully — every failure resolves to `null`, never an
 * exception that reaches the caller. If CityTag changes, this is the one file to fix.
 */
export interface CityTagCreds {
  username: string;
  password: string;
}

export interface TagLocation {
  rego: string;
  name: string;
  lat: number | null;
  lng: number | null;
  time: string | null;
  battery: number | null;
  address: string;
}

const BASE = 'https://citytag.yuminstall.top';
const TOKEN_TTL_MS = 6 * 60 * 60 * 1000; // reuse a login for up to 6h (token valid ~24h)
const DEVICES_TTL_MS = 20 * 1000; // the whole ~300-tag list comes in one call; cache briefly
const FETCH_TIMEOUT_MS = 8000;

const normRego = (s: string) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const firstWord = (s: string) => (s || '').trim().split(/\s+/)[0] || '';

interface Session {
  token: string;
  cookie: string;
  at: number;
}

@Injectable()
export class CityTagConnector {
  private readonly log = new Logger(CityTagConnector.name);
  // Caches keyed by account username, so different tenants' accounts never share a session or device list.
  private sessions = new Map<string, Session>();
  private devices = new Map<string, { at: number; devices: TagLocation[] }>();

  /** Look up one car's last-known location by rego. Resolves null when unavailable. */
  async getLocation(creds: CityTagCreds, rego: string): Promise<TagLocation | null> {
    const wanted = normRego(rego);
    if (!wanted) return null;
    const all = await this.listDevices(creds);
    return (
      all.find((d) => d.rego === wanted) ||
      all.find((d) => normRego(d.name).startsWith(wanted)) ||
      null
    );
  }

  /** All tags with a valid position. Resolves [] on any failure (graceful degrade). */
  async listDevices(creds: CityTagCreds): Promise<TagLocation[]> {
    try {
      const cached = this.devices.get(creds.username);
      if (cached && Date.now() - cached.at < DEVICES_TTL_MS) return cached.devices;

      let raw = await this.selectPage(await this.getSession(creds));
      const dead = raw && !Array.isArray(raw) && !Array.isArray((raw as { data?: unknown }).data);
      if (dead) {
        // Session likely expired — re-login once and retry.
        raw = await this.selectPage(await this.getSession(creds, true));
      }
      const arr: unknown[] = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as { data?: unknown[] })?.data)
          ? (raw as { data: unknown[] }).data
          : [];
      const shaped = arr.map((d) => this.shape(d)).filter((d) => d.lat !== null && d.lng !== null);
      this.devices.set(creds.username, { at: Date.now(), devices: shaped });
      return shaped;
    } catch (e) {
      this.log.warn(`CityTag fetch failed: ${(e as Error)?.message ?? e}`);
      return [];
    }
  }

  private async getSession(creds: CityTagCreds, force = false): Promise<Session> {
    const existing = this.sessions.get(creds.username);
    if (!force && existing && Date.now() - existing.at < TOKEN_TTL_MS) return existing;
    const s = await this.login(creds);
    const session: Session = { ...s, at: Date.now() };
    this.sessions.set(creds.username, session);
    return session;
  }

  private async login(creds: CityTagCreds): Promise<{ token: string; cookie: string }> {
    const res = await this.timedFetch(`${BASE}/api/sign/in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: creds.username, password: creds.password }).toString(),
    });
    const setCookie = res.headers.get('set-cookie') || '';
    const cookie = (/JSESSIONID=[^;]+/.exec(setCookie) || [''])[0];
    const json = (await res.json().catch(() => ({}))) as {
      code?: string;
      msg?: string;
      data?: string | { token?: string };
    };
    const token = typeof json.data === 'string' ? json.data : json?.data?.token;
    if (json.code !== '00000' || !token) {
      throw new Error('CityTag login failed: ' + (json.msg || json.code || 'unknown'));
    }
    return { token, cookie };
  }

  private async selectPage(s: Session): Promise<unknown> {
    const res = await this.timedFetch(`${BASE}/api/citytag/b-device/item/selectPage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        token: s.token,
        Cookie: s.cookie,
      },
      body: new URLSearchParams({ page: '1', limit: '2000' }).toString(),
    });
    return res.json().catch(() => ({}));
  }

  /** Keep ONLY the safe fields; the raw device also carries privatekey/mac/tokens which never leave here. */
  private shape(d: unknown): TagLocation {
    const dev = (d ?? {}) as Record<string, unknown>;
    const parts = String(dev.lastLatLng || '').split(',');
    const lat = parseFloat(parts[0] ?? '');
    const lng = parseFloat(parts[1] ?? '');
    return {
      rego: normRego(firstWord(String(dev.name ?? ''))),
      name: String(dev.name ?? ''),
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      time: (dev.timestamp || dev.voltagetime || dev.gettime || null) as string | null,
      battery: typeof dev.voltageval === 'number' ? dev.voltageval : null,
      address: String(dev.lastAddress ?? ''),
    };
  }

  private async timedFetch(url: string, init: RequestInit): Promise<Response> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
  }
}
