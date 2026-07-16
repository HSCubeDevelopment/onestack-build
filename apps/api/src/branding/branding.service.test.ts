import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { BrandingService } from './branding.service';

// Fake — no DB. A single-row in-memory brand store per tenant.
function make() {
  let row: Record<string, unknown> | null = null;
  const tx = {
    brand: {
      findFirst: async () => row,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        row = { id: 'b1', ...data };
        return row;
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        row = { ...(row as object), ...data };
        return row;
      },
    },
  };
  const tenants = { runInTenant: (_t: string, fn: (tx: unknown) => unknown) => fn(tx) };
  return new BrandingService(tenants as never);
}

describe('BrandingService.get', () => {
  it('returns a default brand when none is set', async () => {
    const b = await make().get('t1');
    expect(b.businessName).toBe('Book online');
    expect(b.logoUrl).toBeNull();
  });
});

describe('BrandingService.upsert', () => {
  it('creates then updates, merging unspecified fields', async () => {
    const svc = make();
    const created = await svc.upsert('t1', { businessName: 'Panel Co', primaryColor: '#1a2b3c' });
    expect(created.businessName).toBe('Panel Co');
    expect(created.primaryColor).toBe('#1a2b3c');

    // Update only the tagline — businessName + colour persist.
    const updated = await svc.upsert('t1', { tagline: 'We fix cars' });
    expect(updated.businessName).toBe('Panel Co');
    expect(updated.primaryColor).toBe('#1a2b3c');
    expect(updated.tagline).toBe('We fix cars');
  });

  it('clears a field when passed an empty string', async () => {
    const svc = make();
    await svc.upsert('t1', { businessName: 'Panel Co', tagline: 'x' });
    const cleared = await svc.upsert('t1', { tagline: '' });
    expect(cleared.tagline).toBeNull();
  });

  it('requires a business name on first setup', async () => {
    await expect(make().upsert('t1', { tagline: 'hi' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a non-hex primary colour', async () => {
    await expect(
      make().upsert('t1', { businessName: 'Panel Co', primaryColor: 'red' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
