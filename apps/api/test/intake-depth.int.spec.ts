// Card 10.1 — intake depth: the details a panel shop actually needs at booking that were previously
// unrecordable. Vehicle paint code (can't be looked up from the rego), and the customer's postal
// address. Insurer/excess already exist on the job's claim block (card #15) and are re-checked here so
// the card's "capture the claim up front" criterion is proven end to end rather than assumed.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Intake depth — VIN, paint code, address, claim (card 10.1)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  const ADDRESS = {
    line1: '12 Sydney Road',
    suburb: 'Coburg',
    state: 'VIC',
    postcode: '3058',
    country: 'Australia',
  };

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Intake A');
    b = await makeTenant(admin, 'Intake B');
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      for (const tbl of [
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

  it('captures a customer address at intake and reads it back', async () => {
    const made = await http()
      .post('/api/v1/contacts')
      .set(auth(a))
      .send({ displayName: 'Amelia Nguyen', phone: '0400111222', address: ADDRESS })
      .expect(201);

    expect(made.body.address).toMatchObject(ADDRESS);

    // And it survives a re-read, i.e. it was persisted rather than just echoed.
    const fetched = await http().get(`/api/v1/contacts/${made.body.id}`).set(auth(a)).expect(200);
    expect(fetched.body.address).toMatchObject(ADDRESS);
  });

  it('treats a customer with no address as valid — a walk-in still gets served', async () => {
    const made = await http()
      .post('/api/v1/contacts')
      .set(auth(a))
      .send({ displayName: 'Walk-in', phone: '0400111333' })
      .expect(201);
    expect(made.body.address).toBeNull();
  });

  it('drops empty address parts rather than persisting blank strings', async () => {
    const made = await http()
      .post('/api/v1/contacts')
      .set(auth(a))
      .send({
        displayName: 'Partial Address',
        phone: '0400111444',
        address: { suburb: 'Preston', line1: '', state: '   ' },
      })
      .expect(201);

    expect(made.body.address).toEqual({ suburb: 'Preston' });
  });

  it('rejects an implausible postcode', async () => {
    await http()
      .post('/api/v1/contacts')
      .set(auth(a))
      .send({ displayName: 'Bad Post', phone: '0400111555', address: { postcode: '!!' } })
      .expect(400);
  });

  it('updates an address without wiping the rest of the contact’s fields', async () => {
    // The regression this guards: address lives inside the `fields` JSONB, so a naive patch that
    // replaced the blob would silently destroy every other pack-specific field on the contact.
    const made = await http()
      .post('/api/v1/contacts')
      .set(auth(a))
      .send({
        displayName: 'Keeps Fields',
        phone: '0400111666',
        fields: { insurerOnFile: 'AAMI' },
        address: ADDRESS,
      })
      .expect(201);

    const patched = await http()
      .patch(`/api/v1/contacts/${made.body.id}`)
      .set(auth(a))
      .send({ address: { ...ADDRESS, suburb: 'Brunswick' } })
      .expect(200);

    expect(patched.body.address.suburb).toBe('Brunswick');
    expect(patched.body.fields.insurerOnFile).toBe('AAMI');
  });

  it('clears an address when explicitly set to null', async () => {
    const made = await http()
      .post('/api/v1/contacts')
      .set(auth(a))
      .send({ displayName: 'To Clear', phone: '0400111777', address: ADDRESS })
      .expect(201);

    const cleared = await http()
      .patch(`/api/v1/contacts/${made.body.id}`)
      .set(auth(a))
      .send({ address: null })
      .expect(200);
    expect(cleared.body.address).toBeNull();
  });

  it('captures VIN and paint code on a vehicle', async () => {
    const customerId = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(a))
        .send({ displayName: 'Vehicle Owner', phone: '0400222111' })
    ).body.id;

    const vehicle = await http()
      .post(`/api/v1/contacts/${customerId}/vehicles`)
      .set(auth(a))
      .send({
        rego: 'ABC123',
        vin: 'JTDBR32E870123456',
        paintCode: '1G3',
        make: 'Toyota',
        model: 'Corolla',
        year: 2020,
      })
      .expect(201);

    expect(vehicle.body.fields).toMatchObject({ vin: 'JTDBR32E870123456', paintCode: '1G3' });
  });

  it('rejects a malformed VIN rather than storing a useless one', async () => {
    // VIN feeds the parts lookup, so a 16-character or I/O/Q-bearing value is worse than none.
    const customerId = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(a))
        .send({ displayName: 'Bad VIN', phone: '0400222222' })
    ).body.id;

    await http()
      .post(`/api/v1/contacts/${customerId}/vehicles`)
      .set(auth(a))
      .send({ rego: 'XYZ789', vin: 'TOOSHORT', make: 'Mazda', model: '3', year: 2019 })
      .expect(400);
  });

  it('captures insurer, claim number and excess on the job at booking', async () => {
    const customerId = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(a))
        .send({ displayName: 'Claim Customer', phone: '0400333111' })
    ).body.id;
    const vehicleId = (
      await http()
        .post(`/api/v1/contacts/${customerId}/vehicles`)
        .set(auth(a))
        .send({ rego: 'CLM001', make: 'Ford', model: 'Ranger', year: 2021 })
    ).body.id;

    const job = await http()
      .post('/api/v1/work-items')
      .set(auth(a))
      .send({
        type: 'job',
        fields: {
          customerId,
          description: 'Front-end collision',
          claim: {
            insurer: 'AAMI',
            claimNumber: 'CLM-99887',
            excessCents: 60000,
            billPayer: 'insurer',
          },
        },
        subjectIds: [vehicleId],
      })
      .expect(201);

    expect(job.body.fields.claim).toMatchObject({
      insurer: 'AAMI',
      claimNumber: 'CLM-99887',
      excessCents: 60000,
    });
  });

  it('is tenant-isolated: shop B cannot read shop A’s customer address', async () => {
    const made = await http()
      .post('/api/v1/contacts')
      .set(auth(a))
      .send({ displayName: 'Private Address', phone: '0400444111', address: ADDRESS })
      .expect(201);

    await http().get(`/api/v1/contacts/${made.body.id}`).set(auth(b)).expect(404);

    // And B cannot overwrite it either — a 404 on read with a successful write would be worse.
    await http()
      .patch(`/api/v1/contacts/${made.body.id}`)
      .set(auth(b))
      .send({ address: { suburb: 'Hacked' } })
      .expect(404);
  });
});
