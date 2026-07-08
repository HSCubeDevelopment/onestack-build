// Phase 3 — Online booking. A shop configures a public booking page; a customer books a free slot 24/7,
// creating a contact + an overlap-checked booking. Deposits (payments) + Google/social channels are
// deferred. Public input is honeypot-guarded. Tenant-isolated via the unguessable token.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Online booking (Phase 3)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let bay1: string;
  let bay2: string;
  let token: string;
  const soon = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'OB A');
    b = await makeTenant(admin, 'OB B');
    app = await createApp();
    await app.init();
    // Seed resources via the admin client (the scheduling controller is feature-gated; the services aren't).
    bay1 = (
      await admin.resource.create({ data: { tenantId: a.tenantId, type: 'bay', name: 'Bay 1' } })
    ).id;
    bay2 = (
      await admin.resource.create({ data: { tenantId: a.tenantId, type: 'bay', name: 'Bay 2' } })
    ).id;
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      for (const tbl of [
        'onestack_booking_page',
        'onestack_booking',
        'onestack_resource',
        'onestack_contact',
      ]) {
        await admin.$executeRawUnsafe(`DELETE FROM "${tbl}" WHERE "tenantId" = $1::uuid`, t);
      }
    }
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  it('configures the booking page (default → enabled with a token)', async () => {
    const before = (await http().get('/api/v1/booking-page').set(auth(a)).expect(200)).body;
    expect(before.exists).toBe(false);

    const page = (
      await http()
        .put('/api/v1/booking-page')
        .set(auth(a))
        .send({ name: 'Book your service', enabled: true, slotMinutes: 60, resourceIds: [bay1] })
        .expect(200)
    ).body;
    expect(page.exists).toBe(true);
    expect(page.enabled).toBe(true);
    expect(page.publicToken).toBeTruthy();
    token = page.publicToken;

    // A bogus resourceId is rejected.
    await http()
      .put('/api/v1/booking-page')
      .set(auth(a))
      .send({ resourceIds: ['11111111-1111-4111-8111-111111111111'] })
      .expect(404);
  });

  it('serves the public page and takes a booking (creating a contact + a booking)', async () => {
    const pub = (await http().get(`/api/v1/public/booking/${token}`).expect(200)).body;
    expect(pub.name).toBe('Book your service');
    expect(pub.resources).toEqual([{ id: bay1, name: 'Bay 1' }]);

    const res = (
      await http()
        .post(`/api/v1/public/booking/${token}`)
        .send({
          resourceId: bay1,
          startsAt: soon,
          customerName: 'Web Walkin',
          customerPhone: '0400999888',
        })
        .expect(201)
    ).body;
    expect(res.confirmed).toBe(true);
    expect(res.bookingId).toBeTruthy();

    // A contact + a booking now exist for the shop.
    expect(
      await admin.contact.count({ where: { tenantId: a.tenantId, displayName: 'Web Walkin' } }),
    ).toBe(1);
    expect(await admin.booking.count({ where: { tenantId: a.tenantId, resourceId: bay1 } })).toBe(
      1,
    );
  });

  it('prevents double-booking, drops the honeypot, and rejects a non-bookable resource', async () => {
    // Same slot again → the scheduling overlap check refuses it.
    await http()
      .post(`/api/v1/public/booking/${token}`)
      .send({
        resourceId: bay1,
        startsAt: soon,
        customerName: 'Clasher',
        customerPhone: '0400111000',
      })
      .expect(409);

    // Honeypot filled → accepted but no booking created.
    const honey = (
      await http()
        .post(`/api/v1/public/booking/${token}`)
        .send({
          resourceId: bay1,
          startsAt: soon,
          customerName: 'Bot',
          customerPhone: '0400000000',
          website: 'http://spam.example',
        })
        .expect(201)
    ).body;
    expect(honey.bookingId).toBe('');

    // bay2 is not in the bookable list → rejected.
    await http()
      .post(`/api/v1/public/booking/${token}`)
      .send({ resourceId: bay2, startsAt: soon, customerName: 'X', customerPhone: '0400222333' })
      .expect(400);
  });

  it('is tenant-isolated: an unknown/disabled token 404s; shop B sees only its own config', async () => {
    await http().get('/api/v1/public/booking/deadbeefdeadbeefdeadbeefdeadbeef').expect(404);

    // Disable A's page → the public token stops working.
    await http().put('/api/v1/booking-page').set(auth(a)).send({ enabled: false }).expect(200);
    await http().get(`/api/v1/public/booking/${token}`).expect(404);
    await http()
      .post(`/api/v1/public/booking/${token}`)
      .send({ resourceId: bay1, startsAt: soon, customerName: 'Y', customerPhone: '0400444555' })
      .expect(404);

    // B has no page of its own (A's is invisible).
    expect((await http().get('/api/v1/booking-page').set(auth(b)).expect(200)).body.exists).toBe(
      false,
    );
  });
});
