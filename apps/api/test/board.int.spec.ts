// Card #22: the job board — a view of jobs grouped by workflow state (Booked → InProgress → …). Cards
// carry job#, customer, vehicle, assignees; "drag to column" is a guarded transition; empty columns show.
// Tenant-isolated. Supabase HTTP.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Job board (card #22)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let jobId: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  const makeJob = async (t: TestTenant, rego: string): Promise<string> => {
    const customerId = (
      await http()
        .post('/api/v1/contacts')
        .set(auth(t))
        .send({ displayName: 'Board Cust', phone: '0400010203' })
    ).body.id;
    const vehicleId = (
      await http()
        .post(`/api/v1/contacts/${customerId}/vehicles`)
        .set(auth(t))
        .send({ rego, make: 'Mazda', model: 'CX-5', year: 2021 })
    ).body.id;
    return (
      await http()
        .post('/api/v1/work-items')
        .set(auth(t))
        .send({ type: 'job', fields: { customerId }, subjectIds: [vehicleId] })
    ).body.id;
  };

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Board A');
    b = await makeTenant(admin, 'Board B');
    app = await createApp();
    await app.init();
    jobId = await makeJob(a, 'BRD1');
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

  it('shows a column per workflow state with the job in Booked, denormalised, and empty columns present', async () => {
    const board = (
      await http().get('/api/v1/board').query({ type: 'job' }).set(auth(a)).expect(200)
    ).body;
    // The automotive job workflow: Booked → InProgress → (AwaitingParts) → Ready → Collected.
    const states = board.columns.map((c: { state: string }) => c.state);
    expect(states).toEqual(['Booked', 'InProgress', 'AwaitingParts', 'Ready', 'Collected']);

    const booked = board.columns.find((c: { state: string }) => c.state === 'Booked');
    expect(booked.cards).toHaveLength(1);
    expect(booked.cards[0]).toMatchObject({ customerName: 'Board Cust' });
    expect(booked.cards[0].reference).toMatch(/^J-\d{6}$/);
    expect(booked.cards[0].vehicleLabel).toContain('BRD1');

    // Empty columns are still present.
    const ready = board.columns.find((c: { state: string }) => c.state === 'Ready');
    expect(ready.cards).toHaveLength(0);
    expect(board.columns.find((c: { state: string }) => c.state === 'Collected').isFinal).toBe(
      true,
    );
  });

  it('drags a card Booked → InProgress and it stays there; rejects an illegal skip', async () => {
    // Illegal: Booked cannot jump straight to Ready.
    await http()
      .post(`/api/v1/board/cards/${jobId}/move`)
      .set(auth(a))
      .send({ targetState: 'Ready' })
      .expect(400);

    // Legal: Booked → InProgress.
    const moved = (
      await http()
        .post(`/api/v1/board/cards/${jobId}/move`)
        .set(auth(a))
        .send({ targetState: 'InProgress' })
        .expect(201)
    ).body;
    expect(moved.stateName).toBe('InProgress');

    // Persisted: the board now shows it in InProgress after a fresh fetch.
    const board = (await http().get('/api/v1/board').set(auth(a)).expect(200)).body;
    expect(board.columns.find((c: { state: string }) => c.state === 'Booked').cards).toHaveLength(
      0,
    );
    expect(
      board.columns.find((c: { state: string }) => c.state === 'InProgress').cards,
    ).toHaveLength(1);
  });

  it("is tenant-isolated: shop B's board shows none of shop A's jobs and B can't move A's card", async () => {
    const board = (await http().get('/api/v1/board').set(auth(b)).expect(200)).body;
    for (const col of board.columns) expect(col.cards).toHaveLength(0);
    await http()
      .post(`/api/v1/board/cards/${jobId}/move`)
      .set(auth(b))
      .send({ targetState: 'Ready' })
      .expect(404);
  });
});
