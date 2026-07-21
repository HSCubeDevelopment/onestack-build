// YRD-2 — Tow collection, end to end against Supabase.
// Proves: a driver's pickup auto-creates a job (with the customer, the car, and a timeline note),
// a STAFF driver may do it, a team notification is enqueued, and it's tenant-isolated.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Tow collection (YRD-2)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  const http = () => request(app.getHttpServer());
  const owner = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });
  const staff = (t: TestTenant) => ({ Authorization: `Bearer ${t.staffToken}` });

  const collection = {
    rego: '7gh 220',
    make: 'VW',
    model: 'Golf',
    year: 2019,
    pickupLocation: '42 Main St, Coburg North',
    customerName: 'John Miller',
    customerPhone: '0455 000 111',
    comments: 'front-end damage, not driveable',
  };

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Tow A');
    b = await makeTenant(admin, 'Tow B');
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      for (const table of [
        'onestack_notification',
        'onestack_work_item_note',
        'onestack_work_item_subject',
        'onestack_work_item',
        'onestack_work_item_counter',
        'onestack_subject',
        'onestack_contact',
      ]) {
        await admin.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "tenantId" = $1::uuid`, t);
      }
    }
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  it('a STAFF driver records a pickup → a job file exists with the car, customer and a tow note', async () => {
    const res = await http()
      .post('/api/v1/yards/tow-collections')
      .set(staff(a))
      .send(collection)
      .expect(201);
    const job = res.body.job;
    expect(job.reference).toMatch(/^J-\d{6}$/);
    expect(job.stateName).toBe('Booked'); // the initial state — no dedicated "towed" stage yet (YRD-3)

    // The car is linked with the normalised rego.
    const card = (await http().get(`/api/v1/work-items/${job.id}`).set(owner(a)).expect(200)).body;
    expect(card.subjects).toHaveLength(1);
    expect(card.subjects[0].fields).toMatchObject({ rego: '7GH220', make: 'VW', model: 'Golf' });

    // The customer was created and linked.
    const customerId = card.fields.customerId as string;
    const contact = (await http().get(`/api/v1/contacts/${customerId}`).set(owner(a)).expect(200))
      .body;
    expect(contact.displayName).toBe('John Miller');

    // The pickup location is on the job's timeline as a note.
    const notes = (await http().get(`/api/v1/work-items/${job.id}/notes`).set(owner(a)).expect(200))
      .body as { body: string }[];
    expect(notes.some((n) => n.body.includes('42 Main St, Coburg North'))).toBe(true);
  });

  it('enqueues a team notification that a car has landed', async () => {
    const rows = await admin.$queryRawUnsafe<{ template: string }[]>(
      `SELECT "template" FROM "onestack_notification" WHERE "tenantId" = $1::uuid AND "template" = 'tow.job_created'`,
      a.tenantId,
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it('is tenant-isolated: shop B sees none of A’s tow-created jobs', async () => {
    const listB = (await http().get('/api/v1/work-items?type=job').set(owner(b)).expect(200))
      .body as { id: string }[];
    expect(listB).toHaveLength(0);
  });
});
