// Card 11.1 — "pull up a car". Search by rego, get the whole record, and do it as any internal role.
// The two behaviours worth guarding: history follows the CAR (not the job it happened to be on), and
// money is WITHHELD rather than shown as zero while card 40.8's finance permission doesn't exist.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Vehicle profile — pull up a car (card 11.1)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let vehicleId: string;
  let customerId: string;
  let firstJobId: string;

  const http = () => request(app.getHttpServer());
  const owner = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });
  const staff = (t: TestTenant) => ({ Authorization: `Bearer ${t.staffToken}` });

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Profile A');
    b = await makeTenant(admin, 'Profile B');
    app = await createApp();
    await app.init();

    customerId = (
      await http()
        .post('/api/v1/contacts')
        .set(owner(a))
        .send({ displayName: 'Priya Sharma', phone: '0400777111' })
    ).body.id;

    vehicleId = (
      await http().post(`/api/v1/contacts/${customerId}/vehicles`).set(owner(a)).send({
        rego: '1XY4KP',
        vin: 'JTDBR32E870123456',
        make: 'Toyota',
        model: 'Corolla',
        year: 2020,
      })
    ).body.id;

    // TWO jobs on the same car, so the "history follows the car" assertion is meaningful.
    const makeJob = async (description: string): Promise<string> =>
      (
        await http()
          .post('/api/v1/work-items')
          .set(owner(a))
          .send({ type: 'job', fields: { customerId, description }, subjectIds: [vehicleId] })
      ).body.id;

    firstJobId = await makeJob('Front bumper scrape');
    const secondJobId = await makeJob('Rear door dent');

    await http()
      .post(`/api/v1/work-items/${firstJobId}/notes`)
      .set(owner(a))
      .send({ body: 'Dropped off, keys in lockbox' });
    await http()
      .post(`/api/v1/work-items/${secondJobId}/notes`)
      .set(owner(a))
      .send({ body: 'Second visit — rear door' });
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      for (const tbl of [
        'onestack_work_item_note',
        'onestack_work_item_attachment',
        'onestack_work_item_subject',
        'onestack_work_item',
        'onestack_work_item_counter',
        'onestack_subject',
        'onestack_contact',
      ]) {
        await admin.$executeRawUnsafe(`DELETE FROM "${tbl}" WHERE "tenantId" = $1::uuid`, t);
      }
    }
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  it('finds a car by full rego', async () => {
    const res = await http().get('/api/v1/vehicle-profile?q=1XY4KP').set(owner(a)).expect(200);
    expect(res.body.map((v: { id: string }) => v.id)).toContain(vehicleId);
  });

  it('finds a car by PARTIAL rego, ignoring case and spaces', async () => {
    // Someone is reading a plate off a car in a workshop, not copying a string.
    for (const q of ['1xy', '1XY 4KP', ' 4kp ']) {
      const res = await http()
        .get(`/api/v1/vehicle-profile?q=${encodeURIComponent(q)}`)
        .set(owner(a))
        .expect(200);
      expect(
        res.body.map((v: { id: string }) => v.id),
        `query "${q}"`,
      ).toContain(vehicleId);
    }
  });

  it('finds a car by VIN as well as rego', async () => {
    const res = await http()
      .get('/api/v1/vehicle-profile?q=JTDBR32E870123456')
      .set(owner(a))
      .expect(200);
    expect(res.body.map((v: { id: string }) => v.id)).toContain(vehicleId);
  });

  it('returns nothing for an empty query rather than every car in the shop', async () => {
    expect((await http().get('/api/v1/vehicle-profile?q=').set(owner(a)).expect(200)).body).toEqual(
      [],
    );
  });

  it('gives the whole record: customer, jobs, current job, photos, timeline', async () => {
    const p = (await http().get(`/api/v1/vehicle-profile/${vehicleId}`).set(owner(a)).expect(200))
      .body;

    expect(p.vehicle.fields).toMatchObject({ rego: '1XY4KP', make: 'Toyota' });
    expect(p.customer.displayName).toBe('Priya Sharma');

    // History follows the CAR: both visits are here, not just the one you happened to open.
    expect(p.jobs).toHaveLength(2);
    expect(p.timeline.length).toBeGreaterThanOrEqual(4); // 2 jobs + 2 notes

    // "Current" is the open job, so the floor knows what the car is doing right now.
    expect(p.currentJob).not.toBeNull();
    expect(p.currentJob.isOpen).toBe(true);
  });

  it('withholds money rather than reporting zero', async () => {
    // The card gates dollars behind finance.view (card 40.8), which does not exist yet. Showing $0
    // would be a lie; `moneyHidden` lets the UI say "hidden" honestly.
    const p = (await http().get(`/api/v1/vehicle-profile/${vehicleId}`).set(owner(a)).expect(200))
      .body;
    expect(p.moneyHidden).toBe(true);
    for (const event of p.timeline) expect(event.amountsCents).toBeNull();
  });

  it('is open to STAFF — this is the lookup everyone uses all day', async () => {
    await http().get('/api/v1/vehicle-profile?q=1XY4KP').set(staff(a)).expect(200);
    await http().get(`/api/v1/vehicle-profile/${vehicleId}`).set(staff(a)).expect(200);
  });

  it('is tenant-isolated: shop B cannot find or open shop A’s car', async () => {
    const found = await http().get('/api/v1/vehicle-profile?q=1XY4KP').set(owner(b)).expect(200);
    expect(found.body).toEqual([]);

    await http().get(`/api/v1/vehicle-profile/${vehicleId}`).set(owner(b)).expect(404);
  });

  it('404s for something that is not a vehicle', async () => {
    // A contact id is a plausible thing to paste into a vehicle URL by mistake.
    await http().get(`/api/v1/vehicle-profile/${customerId}`).set(owner(a)).expect(404);
  });
});
