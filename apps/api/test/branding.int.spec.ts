// Phase 3 — Branded booking pages (card #151). A per-tenant brand (business name, logo, colour, contact)
// that the public booking page renders under. Payments ("and pay") are deferred. Tenant-isolated.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { FeatureFlagService } from '../src/composition/feature-flag.service';
import { TenantService } from '../src/tenancy/tenant.service';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Branded booking pages (Phase 3)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let publicToken: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Brand A');
    b = await makeTenant(admin, 'Brand B');
    app = await createApp();
    await app.init();
    const flags = new FeatureFlagService(new TenantService());
    await flags.setEnabled(a.tenantId, 'scheduling', true);

    // A bookable resource + a booking page so the public page resolves.
    const bayId = (
      await http()
        .post('/api/v1/resources')
        .set(auth(a))
        .send({ type: 'bay', name: 'Bay 1' })
        .expect(201)
    ).body.id;
    const page = (
      await http()
        .put('/api/v1/booking-page')
        .set(auth(a))
        .send({ name: 'Book with us', enabled: true, slotMinutes: 60, resourceIds: [bayId] })
        .expect(200)
    ).body;
    publicToken = page.publicToken;
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      for (const tbl of [
        'onestack_brand',
        'onestack_booking',
        'onestack_booking_page',
        'onestack_resource',
        'onestack_feature_flag',
      ]) {
        await admin.$executeRawUnsafe(`DELETE FROM "${tbl}" WHERE "tenantId" = $1::uuid`, t);
      }
    }
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  it('returns a default brand before setup', async () => {
    const brand = (await http().get('/api/v1/brand').set(auth(a)).expect(200)).body;
    expect(brand.businessName).toBe('Book online');
    expect(brand.logoUrl).toBeNull();
  });

  it('upserts the brand and validates the colour', async () => {
    const brand = (
      await http()
        .put('/api/v1/brand')
        .set(auth(a))
        .send({
          businessName: 'Panel Co',
          tagline: 'Smash repairs done right',
          primaryColor: '#1a2b3c',
          contactPhone: '0399990000',
        })
        .expect(200)
    ).body;
    expect(brand.businessName).toBe('Panel Co');
    expect(brand.primaryColor).toBe('#1a2b3c');

    await http().put('/api/v1/brand').set(auth(a)).send({ primaryColor: 'notacolour' }).expect(400);
  });

  it('renders the public booking page under the shop brand (no auth)', async () => {
    const page = (await http().get(`/api/v1/public/booking/${publicToken}`).expect(200)).body;
    expect(page.name).toBe('Book with us');
    expect(page.brand.businessName).toBe('Panel Co');
    expect(page.brand.tagline).toBe('Smash repairs done right');
    expect(page.resources.length).toBe(1);
  });

  it("is tenant-isolated: shop B's brand is its own default, not shop A's", async () => {
    const brandB = (await http().get('/api/v1/brand').set(auth(b)).expect(200)).body;
    expect(brandB.businessName).toBe('Book online'); // default, not "Panel Co"
  });
});
