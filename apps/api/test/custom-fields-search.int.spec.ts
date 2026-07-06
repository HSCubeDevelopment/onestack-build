// Card #11: per-tenant custom fields on customers/vehicles + customer/vehicle search. A required field
// blocks save; search finds by phone and by rego/make; everything is tenant-isolated. Supabase HTTP.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Custom fields + search (card #11)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.staffToken}` });

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'CF A');
    b = await makeTenant(admin, 'CF B');
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      for (const tbl of [
        'onestack_custom_field',
        'onestack_work_item_subject',
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

  it('defines a required customer field; it blocks save when empty and stores when provided', async () => {
    await http()
      .post('/api/v1/custom-fields')
      .set(auth(a))
      .send({
        appliesTo: 'customer',
        key: 'insurer',
        label: 'Insurer',
        type: 'text',
        required: true,
      })
      .expect(201);

    // Missing the required field → 400.
    await http()
      .post('/api/v1/contacts')
      .set(auth(a))
      .send({ displayName: 'Needs Insurer', phone: '0400111111' })
      .expect(400);

    // Providing it → created, value stored under customFields.
    const created = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(a))
        .send({
          displayName: 'Has Insurer',
          phone: '0400111222',
          customFields: { insurer: 'AAMI' },
        })
        .expect(201)
    ).body;
    expect(created.customFields).toEqual({ insurer: 'AAMI' });

    // An unknown custom key is rejected.
    await http()
      .post('/api/v1/contacts')
      .set(auth(a))
      .send({ displayName: 'Bad', phone: '0400111333', customFields: { insurer: 'X', bogus: 1 } })
      .expect(400);
  });

  it('validates a select field against its options', async () => {
    await http()
      .post('/api/v1/custom-fields')
      .set(auth(a))
      .send({
        appliesTo: 'vehicle',
        key: 'colour',
        label: 'Colour',
        type: 'select',
        options: ['Red', 'Blue'],
      })
      .expect(201);

    const customerId = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(a))
        .send({ displayName: 'V Owner', phone: '0400222000', customFields: { insurer: 'RACV' } })
    ).body.id;

    // Bad option rejected.
    await http()
      .post(`/api/v1/contacts/${customerId}/vehicles`)
      .set(auth(a))
      .send({
        rego: 'CFA1',
        make: 'Toyota',
        model: 'Corolla',
        year: 2020,
        customFields: { colour: 'Green' },
      })
      .expect(400);

    // Valid option stored.
    const veh = (
      await http()
        .post(`/api/v1/contacts/${customerId}/vehicles`)
        .set(auth(a))
        .send({
          rego: 'CFA1',
          make: 'Toyota',
          model: 'Corolla',
          year: 2020,
          customFields: { colour: 'Red' },
        })
        .expect(201)
    ).body;
    expect(veh.customFields).toEqual({ colour: 'Red' });
  });

  it('searches customers by phone/email and vehicles by rego/make', async () => {
    // Customer search by phone.
    const byPhone = (
      await http().get('/api/v1/contacts').query({ q: '0400111222' }).set(auth(a)).expect(200)
    ).body;
    expect(byPhone.some((c: { displayName: string }) => c.displayName === 'Has Insurer')).toBe(
      true,
    );

    // Vehicle search across fields — by rego and by make.
    const byRego = (
      await http().get('/api/v1/vehicles').query({ q: 'CFA1' }).set(auth(a)).expect(200)
    ).body;
    expect(byRego.length).toBeGreaterThanOrEqual(1);
    const byMake = (
      await http().get('/api/v1/vehicles').query({ q: 'toyota' }).set(auth(a)).expect(200)
    ).body;
    expect(byMake.length).toBeGreaterThanOrEqual(1);

    // No matches → empty list (friendly, not an error).
    expect(
      (await http().get('/api/v1/vehicles').query({ q: 'zzzznomatch' }).set(auth(a)).expect(200))
        .body,
    ).toHaveLength(0);
  });

  it('archiving a field keeps existing values but stops requiring it', async () => {
    const field = (
      await http().get('/api/v1/custom-fields').query({ appliesTo: 'customer' }).set(auth(a))
    ).body.find((f: { key: string }) => f.key === 'insurer');
    await http().delete(`/api/v1/custom-fields/${field.id}`).set(auth(a)).expect(204);

    // Now a customer can be created WITHOUT the (archived) insurer field.
    await http()
      .post('/api/v1/contacts')
      .set(auth(a))
      .send({ displayName: 'Post Archive', phone: '0400333000' })
      .expect(201);
  });

  it("is tenant-isolated: shop B has no custom fields and can't see shop A's records", async () => {
    expect((await http().get('/api/v1/custom-fields').set(auth(b)).expect(200)).body).toHaveLength(
      0,
    );
    // B's search over A's phone finds nothing.
    expect(
      (await http().get('/api/v1/contacts').query({ q: '0400111222' }).set(auth(b)).expect(200))
        .body,
    ).toHaveLength(0);
    // B can create a customer with no custom-field requirement (A's required field doesn't apply to B).
    await http()
      .post('/api/v1/contacts')
      .set(auth(b))
      .send({ displayName: 'B Cust', phone: '0400444000' })
      .expect(201);
  });
});
