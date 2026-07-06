// Card #10: Vehicle & Customer record (automotive vertical, on the generic core). HTTP against Supabase.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Vehicle & Customer (card #10)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Cust A');
    b = await makeTenant(admin, 'Cust B');
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      await admin.$executeRawUnsafe(
        `DELETE FROM "onestack_subject" WHERE "tenantId" = $1::uuid`,
        t,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM "onestack_contact" WHERE "tenantId" = $1::uuid`,
        t,
      );
    }
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.staffToken}` });

  it('creates a customer (name+phone required), rejects a missing phone', async () => {
    const res = await http()
      .post('/api/v1/contacts')
      .set(auth(a))
      .send({
        displayName: 'Jane Smith',
        phone: '0400123456',
        email: 'jane@example.com',
        fields: { insurer: 'AAMI', excess: 500 },
      })
      .expect(201);
    expect(res.body).toMatchObject({
      displayName: 'Jane Smith',
      fields: { insurer: 'AAMI', excess: 500 },
    });

    await http()
      .post('/api/v1/contacts')
      .set(auth(a))
      .send({ displayName: 'No Phone' })
      .expect(400);
  });

  it('adds a vehicle (pack-validated), rejects a bad rego, and lists/searches it', async () => {
    const cust = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(a))
        .send({ displayName: 'Bob', phone: '0411222333' })
        .expect(201)
    ).body;

    await http()
      .post(`/api/v1/contacts/${cust.id}/vehicles`)
      .set(auth(a))
      .send({ rego: 'ABC123', make: 'Toyota', model: 'Hilux', year: 2021 })
      .expect(201);

    // Bad rego (too long) → pack schema / DTO rejects with a friendly 400.
    await http()
      .post(`/api/v1/contacts/${cust.id}/vehicles`)
      .set(auth(a))
      .send({ rego: 'WAYTOOLONG', make: 'Toyota', model: 'Hilux', year: 2021 })
      .expect(400);

    const vehicles = (
      await http().get(`/api/v1/contacts/${cust.id}/vehicles`).set(auth(a)).expect(200)
    ).body;
    expect(vehicles).toHaveLength(1);
    expect(vehicles[0].fields).toMatchObject({ rego: 'ABC123', make: 'Toyota' });

    // Search customers by name; search vehicles by rego.
    const byName = (await http().get('/api/v1/contacts?q=Bob').set(auth(a)).expect(200)).body;
    expect(byName.some((c: { id: string }) => c.id === cust.id)).toBe(true);
    const byRego = (await http().get('/api/v1/vehicles?rego=ABC').set(auth(a)).expect(200)).body;
    expect(byRego.some((v: { contactId: string }) => v.contactId === cust.id)).toBe(true);
  });

  it('edits and soft-deletes a customer', async () => {
    const cust = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(a))
        .send({ displayName: 'Editable', phone: '0400000001' })
        .expect(201)
    ).body;
    await http()
      .patch(`/api/v1/contacts/${cust.id}`)
      .set(auth(a))
      .send({ phone: '0499999999' })
      .expect(200);
    expect(
      (await http().get(`/api/v1/contacts/${cust.id}`).set(auth(a)).expect(200)).body.phone,
    ).toBe('0499999999');

    await http().delete(`/api/v1/contacts/${cust.id}`).set(auth(a)).expect(204);
    await http().get(`/api/v1/contacts/${cust.id}`).set(auth(a)).expect(404);
  });

  it("is tenant-isolated: tenant B cannot see tenant A's customers", async () => {
    const cust = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(a))
        .send({ displayName: 'A Secret', phone: '0400000002' })
        .expect(201)
    ).body;
    await http().get(`/api/v1/contacts/${cust.id}`).set(auth(b)).expect(404); // RLS → invisible to B
    const listB = (await http().get('/api/v1/contacts').set(auth(b)).expect(200)).body;
    expect(
      listB.find((c: { displayName: string }) => c.displayName === 'A Secret'),
    ).toBeUndefined();
  });
});
