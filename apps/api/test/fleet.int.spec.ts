// Fleet & courtesy cars (migrated 1:1 from the "In N Out" staff app). Movements (car in / loan car out),
// returns that close the loop, bookings, dashboard — all tenant-isolated.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Fleet & courtesy cars', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let movementId: string;
  let bookingId: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Fleet A');
    b = await makeTenant(admin, 'Fleet B');
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      for (const tbl of [
        'onestack_fleet_photo',
        'onestack_fleet_booking',
        'onestack_fleet_return',
        'onestack_fleet_movement',
        'onestack_fleet_vehicle',
      ]) {
        await admin.$executeRawUnsafe(`DELETE FROM "${tbl}" WHERE "tenantId" = $1::uuid`, t);
      }
    }
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  it('records a movement (customer car in, fleet car out) and marks the fleet car OUT', async () => {
    movementId = (
      await http()
        .post('/api/v1/fleet/movements')
        .set(auth(a))
        .send({ driverName: 'Jane', driverPhone: '0400000000', carsInRego: 'cust01', carsOutRego: 'fleet01', purpose: 'COURTESY' })
        .expect(201)
    ).body.id;
    const list = (await http().get('/api/v1/fleet/movements').set(auth(a)).expect(200)).body;
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe('active');
    const vehicles = (await http().get('/api/v1/fleet/vehicles').set(auth(a)).expect(200)).body;
    const fleetCar = vehicles.find((v: { rego: string }) => v.rego === 'FLEET01');
    expect(fleetCar.status).toBe('out');
  });

  it('records a return that closes the movement and frees the fleet car', async () => {
    await http()
      .post('/api/v1/fleet/returns')
      .set(auth(a))
      .send({ returnedRego: 'fleet01', driverName: 'Jane' })
      .expect(201);
    const movement = (await http().get(`/api/v1/fleet/movements/${movementId}`).set(auth(a)).expect(200)).body;
    expect(movement.status).toBe('returned');
    const vehicles = (await http().get('/api/v1/fleet/vehicles').set(auth(a)).expect(200)).body;
    expect(vehicles.find((v: { rego: string }) => v.rego === 'FLEET01').status).toBe('available');
  });

  it('creates then cancels a booking, releasing the reserved car', async () => {
    bookingId = (
      await http()
        .post('/api/v1/fleet/bookings')
        .set(auth(a))
        .send({ vehicleRego: 'book01', bookingName: 'Sam', startAt: '2027-02-10T09:00:00.000Z' })
        .expect(201)
    ).body.id;
    let vehicles = (await http().get('/api/v1/fleet/vehicles').set(auth(a)).expect(200)).body;
    expect(vehicles.find((v: { rego: string }) => v.rego === 'BOOK01').status).toBe('booked');
    const cancelled = (
      await http().post(`/api/v1/fleet/bookings/${bookingId}/cancel`).set(auth(a)).expect(201)
    ).body;
    expect(cancelled.status).toBe('cancelled');
    vehicles = (await http().get('/api/v1/fleet/vehicles').set(auth(a)).expect(200)).body;
    expect(vehicles.find((v: { rego: string }) => v.rego === 'BOOK01').status).toBe('available');
  });

  it('is tenant-isolated: shop B sees none of A\'s fleet data and cannot read A\'s movement', async () => {
    expect((await http().get('/api/v1/fleet/movements').set(auth(b)).expect(200)).body).toHaveLength(0);
    expect((await http().get('/api/v1/fleet/vehicles').set(auth(b)).expect(200)).body).toHaveLength(0);
    const stats = (await http().get('/api/v1/fleet/dashboard').set(auth(b)).expect(200)).body;
    expect(stats.carsOut).toBe(0);
    expect(stats.availableCars).toBe(0);
    // B cannot read A's movement by id.
    await http().get(`/api/v1/fleet/movements/${movementId}`).set(auth(b)).expect(404);
  });
});
