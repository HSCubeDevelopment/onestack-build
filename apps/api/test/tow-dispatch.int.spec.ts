// Tow dispatch — the office books a collection and a named driver receives it.
//
// The security shape is the point of these tests, not the happy path. Booking is open to STAFF, which
// the general assign route deliberately is not, so the guards that make that safe have to hold: a tow
// can only ever go to a TOW-role member of the same shop, and a driver only ever sees their own work.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import {
  adminPrisma,
  dropTenant,
  hasDb,
  makeTenant,
  signToken,
  TestTenant,
} from './helpers/harness';

describe.skipIf(!hasDb)('Tow dispatch', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let driverUserId: string;
  let driverToken: string;
  let yardId: string;
  let jobId: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  const booking = () => ({
    driverUserId,
    destinationYardId: yardId,
    pickupAddress: '12 Example St, Epping VIC',
    rego: 'TOW001',
    make: 'Toyota',
    model: 'Hilux',
    year: 2019,
    customerName: 'Tow Customer',
    customerPhone: '0400111222',
    pickupNotes: 'Keys with reception',
  });

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Tow A');
    b = await makeTenant(admin, 'Tow B');

    driverUserId = randomUUID();
    await admin.membership.create({
      data: { tenantId: a.tenantId, userId: driverUserId, role: 'TOW' },
    });
    driverToken = signToken({ userId: driverUserId, tenantId: a.tenantId, role: 'TOW' });

    const yard = await admin.yard.create({
      data: { tenantId: a.tenantId, name: 'Test Yard', latitude: -37.6894, longitude: 144.9976 },
    });
    yardId = yard.id;

    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      for (const tbl of [
        'onestack_dispatch',
        'onestack_work_item_note',
        'onestack_work_item_subject',
        'onestack_work_item',
        'onestack_work_item_counter',
        'onestack_subject',
        'onestack_contact',
        'onestack_yard',
      ]) {
        await admin.$executeRawUnsafe(`DELETE FROM "${tbl}" WHERE "tenantId" = $1::uuid`, t);
      }
    }
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  it('lists only TOW-role members as possible drivers', async () => {
    const res = await http().get('/api/v1/tow/drivers').set(auth(a.ownerToken)).expect(200);
    expect(res.body.map((d: { userId: string }) => d.userId)).toEqual([driverUserId]);
  });

  it('lets a STAFF member book a tow, not just the owner', async () => {
    const res = await http()
      .post('/api/v1/tow/jobs')
      .set(auth(a.staffToken))
      .send(booking())
      .expect(201);
    jobId = res.body.jobId;
    expect(res.body.status).toBe('dispatched');
    expect(res.body.pickupAddress).toBe('12 Example St, Epping VIC');
    expect(res.body.dropOff.name).toBe('Test Yard');
    expect(res.body.vehicle).toMatchObject({ rego: 'TOW001', make: 'Toyota', model: 'Hilux' });
    expect(res.body.customer).toMatchObject({ name: 'Tow Customer', phone: '0400111222' });
  });

  it('refuses to send someone who is not a tow driver', async () => {
    // The guard that makes staff booking safe: an arbitrary user id cannot be written into assignees,
    // which is the column every non-owner's visibility is derived from.
    await http()
      .post('/api/v1/tow/jobs')
      .set(auth(a.staffToken))
      .send({ ...booking(), driverUserId: a.staffUserId })
      .expect(400);
  });

  it('refuses a yard that does not exist', async () => {
    await http()
      .post('/api/v1/tow/jobs')
      .set(auth(a.staffToken))
      .send({ ...booking(), destinationYardId: randomUUID() })
      .expect(404);
  });

  it('shows the pickup to the assigned driver', async () => {
    const res = await http().get('/api/v1/tow/mine').set(auth(driverToken)).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].jobId).toBe(jobId);
    expect(res.body[0].customer.phone).toBe('0400111222');
  });

  it('hides it from a worker it was not assigned to', async () => {
    const res = await http().get('/api/v1/tow/mine').set(auth(a.staffToken)).expect(200);
    expect(res.body).toHaveLength(0);
  });

  it('reuses an existing customer instead of creating a duplicate', async () => {
    // The older tow flow creates a fresh Contact on every pickup, which is how the customer list
    // filled with duplicates. Same number, same person.
    await http()
      .post('/api/v1/tow/jobs')
      .set(auth(a.staffToken))
      .send({ ...booking(), rego: 'TOW002', customerName: 'Tow Customer' })
      .expect(201);
    const contacts = await admin.contact.count({
      where: { tenantId: a.tenantId, phone: '0400111222', deletedAt: null },
    });
    expect(contacts).toBe(1);
  });

  it("is tenant-isolated: shop B sees none of shop A's tows and cannot book into its yard", async () => {
    const res = await http().get('/api/v1/tow/mine').set(auth(b.ownerToken)).expect(200);
    expect(res.body).toHaveLength(0);
    await http().get(`/api/v1/tow/jobs/${jobId}`).set(auth(b.ownerToken)).expect(404);
    await http().post('/api/v1/tow/jobs').set(auth(b.ownerToken)).send(booking()).expect(400);
  });
});
