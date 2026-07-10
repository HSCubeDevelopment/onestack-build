import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { MarketplaceService } from './marketplace.service';
import { CATALOGUE } from './catalogue';

function make() {
  const conns: any[] = [];
  const tx = {
    integrationConnection: {
      findMany: async () => conns,
      findFirst: async ({ where }: any) => conns.find((c) => c.slug === where.slug) ?? null,
      create: async ({ data }: any) => { const r = { id: `ic${conns.length + 1}`, status: 'connected', connectedAt: new Date(), ...data }; conns.push(r); return r; },
      update: async ({ where, data }: any) => { const r = conns.find((c) => c.id === where.id); Object.assign(r, data); return r; },
      updateMany: async ({ where, data }: any) => { const r = conns.find((c) => c.slug === where.slug); if (r) Object.assign(r, data); return { count: r ? 1 : 0 }; },
    },
  };
  const tenants = { runInTenant: (_t: string, fn: (tx: unknown) => unknown) => fn(tx) };
  return { svc: new MarketplaceService(tenants as never) };
}

describe('MarketplaceService', () => {
  it('lists the whole catalogue with not_connected by default', async () => {
    const { svc } = make();
    const list = await svc.list('t1');
    expect(list).toHaveLength(CATALOGUE.length);
    expect(list.every((i) => i.status === 'not_connected')).toBe(true);
  });

  it('connects and disconnects an integration', async () => {
    const { svc } = make();
    let v = await svc.connect('t1', 'xero', { orgId: 'abc' });
    expect(v.status).toBe('connected');
    expect(v.connectedAt).toBeTruthy();
    v = await svc.disconnect('t1', 'xero');
    expect(v.status).toBe('disconnected');
    expect(v.connectedAt).toBeNull();
  });

  it('rejects an unknown integration', async () => {
    const { svc } = make();
    await expect(svc.connect('t1', 'nope')).rejects.toBeInstanceOf(BadRequestException);
  });
});
