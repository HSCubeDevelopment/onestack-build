// Card 52.3 — the operations pipeline over the real automotive workflow. The unit tests cover the
// logic against a deliberately non-automotive workflow; this proves it renders the pack the shop
// actually uses, and that one shop's board never shows another's cars.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Operations pipeline (card 52.3)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;

  const http = () => request(app.getHttpServer());
  const owner = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  const makeJob = async (t: TestTenant, rego: string): Promise<string> => {
    const customerId = (
      await http()
        .post('/api/v1/contacts')
        .set(owner(t))
        .send({ displayName: `Cust ${rego}`, phone: '0400900001' })
    ).body.id;
    const vehicleId = (
      await http()
        .post(`/api/v1/contacts/${customerId}/vehicles`)
        .set(owner(t))
        .send({ rego, make: 'Mazda', model: '3', year: 2020 })
    ).body.id;
    return (
      await http()
        .post('/api/v1/work-items')
        .set(owner(t))
        .send({ type: 'job', fields: { customerId }, subjectIds: [vehicleId] })
    ).body.id;
  };

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Pipe A');
    b = await makeTenant(admin, 'Pipe B');
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

  it('renders the automotive stages in workflow order, from the pack', () => {
    return http()
      .get('/api/v1/pipeline')
      .set(owner(a))
      .expect(200)
      .expect((res) => {
        const names = res.body.stages.map((s: { name: string }) => s.name);
        // Straight out of automotive.pack.ts — core has no list of these anywhere.
        expect(names).toEqual(['Booked', 'InProgress', 'AwaitingParts', 'Ready', 'Collected']);
        expect(res.body.stages[0].order).toBe(0);
        expect(res.body.stages.at(-1).isFinal).toBe(true);
      });
  });

  it('counts a new job into the initial stage', async () => {
    await makeJob(a, 'PIPE01');

    const res = await http().get('/api/v1/pipeline').set(owner(a)).expect(200);
    const booked = res.body.stages.find((s: { name: string }) => s.name === 'Booked');
    expect(booked.count).toBeGreaterThanOrEqual(1);
    expect(res.body.items.some((i: { stateName: string }) => i.stateName === 'Booked')).toBe(true);
  });

  it('moves an item between stages when the job transitions', async () => {
    const jobId = await makeJob(a, 'PIPE02');
    await http()
      .post(`/api/v1/work-items/${jobId}/transition`)
      .set(owner(a))
      .send({ event: 'START' })
      .expect(201);

    const res = await http().get('/api/v1/pipeline').set(owner(a)).expect(200);
    const moved = res.body.items.find((i: { id: string }) => i.id === jobId);
    expect(moved.stateName).toBe('InProgress');
  });

  it('reports nothing stuck for freshly-created work', async () => {
    // Everything here was made seconds ago, so the alert list must be quiet. A dashboard that cries
    // wolf on day one gets ignored by day two.
    const res = await http().get('/api/v1/pipeline').set(owner(a)).expect(200);
    expect(res.body.stuck).toEqual([]);
    expect(res.body.items.every((i: { hoursInStage: number }) => i.hoursInStage === 0)).toBe(true);
  });

  it('is tenant-isolated: shop B’s board never shows shop A’s cars', async () => {
    await makeJob(a, 'PIPE03');

    const res = await http().get('/api/v1/pipeline').set(owner(b)).expect(200);
    expect(res.body.items).toEqual([]);
    // B still sees the full set of stages — the shape of the board is config, not data.
    expect(res.body.stages).toHaveLength(5);
    expect(res.body.stages.every((s: { count: number }) => s.count === 0)).toBe(true);
  });

  it('keeps the whole-shop board away from STAFF', async () => {
    // An employee sees their own jobs (card #12), not the shop-wide picture.
    await http()
      .get('/api/v1/pipeline')
      .set({ Authorization: `Bearer ${a.staffToken}` })
      .expect(403);
  });
});
