import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CityTagConnector } from './citytag.connector';
import { TrackingService } from './tracking.service';

const DEMO = '0d15ea5e-0000-4000-8000-000000000001';
const OTHER = '0d15ea5e-0000-4000-8000-000000000002';

describe('TrackingService', () => {
  const savedEnv = { ...process.env };
  let connector: CityTagConnector;
  let getLocation: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getLocation = vi.fn();
    connector = { getLocation } as unknown as CityTagConnector;
    delete process.env.CITYTAG_USER;
    delete process.env.CITYTAG_PASS;
    process.env.DEMO_TENANT_ID = DEMO;
  });
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it('is "not configured" with no creds, and never calls CityTag (no fabricated positions)', async () => {
    const svc = new TrackingService(connector);
    const r = await svc.locate(DEMO, '1AB2CD');
    expect(r).toEqual({ configured: false, device: null });
    expect(getLocation).not.toHaveBeenCalled();
  });

  it('uses the bare CITYTAG_USER/PASS only for the demo tenant (not another tenant)', async () => {
    process.env.CITYTAG_USER = 'u';
    process.env.CITYTAG_PASS = 'p';
    getLocation.mockResolvedValue({ rego: '1AB2CD', lat: 1, lng: 2 });
    const svc = new TrackingService(connector);

    const demo = await svc.locate(DEMO, '1AB2CD');
    expect(demo.configured).toBe(true);
    expect(getLocation).toHaveBeenCalledWith({ username: 'u', password: 'p' }, '1AB2CD');

    // Another tenant must NOT inherit the demo tenant's global creds.
    getLocation.mockClear();
    const other = await svc.locate(OTHER, '1AB2CD');
    expect(other.configured).toBe(false);
    expect(getLocation).not.toHaveBeenCalled();
  });

  it('prefers per-tenant creds (CITYTAG__<tenant>__USER/PASS) over the bare fallback', async () => {
    const key = OTHER.replace(/-/g, '');
    process.env[`CITYTAG__${key}__USER`] = 'ou';
    process.env[`CITYTAG__${key}__PASS`] = 'op';
    getLocation.mockResolvedValue(null);
    const svc = new TrackingService(connector);
    await svc.locate(OTHER, 'XYZ');
    expect(getLocation).toHaveBeenCalledWith({ username: 'ou', password: 'op' }, 'XYZ');
  });

  it('degrades gracefully if the connector throws', async () => {
    process.env.CITYTAG_USER = 'u';
    process.env.CITYTAG_PASS = 'p';
    getLocation.mockRejectedValue(new Error('CityTag down'));
    const svc = new TrackingService(connector);
    const r = await svc.locate(DEMO, '1AB2CD');
    expect(r.configured).toBe(true);
    expect(r.device).toBeNull();
    expect(r.error).toContain('CityTag down');
  });
});
