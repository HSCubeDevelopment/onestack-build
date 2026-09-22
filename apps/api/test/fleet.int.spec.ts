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
        .send({
          driverName: 'Jane',
          driverPhone: '0400000000',
          carsInRego: 'cust01',
          carsOutRego: 'fleet01',
          purpose: 'COURTESY',
        })
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
    const movement = (
      await http().get(`/api/v1/fleet/movements/${movementId}`).set(auth(a)).expect(200)
    ).body;
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

  it("is tenant-isolated: shop B sees none of A's fleet data and cannot read A's movement", async () => {
    expect(
      (await http().get('/api/v1/fleet/movements').set(auth(b)).expect(200)).body,
    ).toHaveLength(0);
    expect((await http().get('/api/v1/fleet/vehicles').set(auth(b)).expect(200)).body).toHaveLength(
      0,
    );
    const stats = (await http().get('/api/v1/fleet/dashboard').set(auth(b)).expect(200)).body;
    expect(stats.carsOut).toBe(0);
    expect(stats.availableCars).toBe(0);
    // B cannot read A's movement by id.
    await http().get(`/api/v1/fleet/movements/${movementId}`).set(auth(b)).expect(404);
  });

  it("keeps the loan car's photos apart from the customer car's on the same movement", async () => {
    // The bug this guards: a COURTESY movement names TWO cars — the customer's arriving for repair
    // (carsInRego) and the loan car going out (carsOutRego) — and every photo hangs off the MOVEMENT,
    // not off a car. Matching the movement alone showed the customer's damage on our loan car. In the
    // real data, 1WZ1BY displayed a red Camry belonging to 2BX5YT.
    const loan = await admin.fleetVehicle.create({
      data: { tenantId: a.tenantId, rego: 'ZLOAN9', make: 'Toyota', model: 'Camry' },
    });
    const customer = await admin.fleetVehicle.create({
      data: { tenantId: a.tenantId, rego: 'ZCUST9', make: 'Toyota', model: 'Camry' },
    });
    const mv = await admin.fleetMovement.create({
      data: {
        tenantId: a.tenantId,
        carsInRego: 'ZCUST9', // theirs, in for repair
        carsOutRego: 'ZLOAN9', // ours, going out
        purpose: 'COURTESY',
        status: 'active',
      },
    });
    await admin.fleetPhoto.createMany({
      data: [
        {
          tenantId: a.tenantId,
          movementId: mv.id,
          photoType: 'before_handover',
          storagePath: `${a.tenantId}/p1`,
          contentType: 'image/jpeg',
        },
        {
          tenantId: a.tenantId,
          movementId: mv.id,
          photoType: 'damage',
          storagePath: `${a.tenantId}/p2`,
          contentType: 'image/jpeg',
        },
      ],
    });

    const forLoan = (
      await http().get(`/api/v1/fleet/photos?vehicleId=${loan.id}`).set(auth(a)).expect(200)
    ).body;
    const forCustomer = (
      await http().get(`/api/v1/fleet/photos?vehicleId=${customer.id}`).set(auth(a)).expect(200)
    ).body;

    // Our loan car gets its handover shot and NOT the damage to somebody else's vehicle.
    expect(forLoan.map((p: { photoType: string }) => p.photoType)).toEqual(['before_handover']);
    // Their car gets the damage, which is the whole reason those photos exist.
    expect(forCustomer.map((p: { photoType: string }) => p.photoType)).toEqual(['damage']);
  });
});
