// Card #3 + #4 end-to-end through the real HTTP stack: guard → tenant txn → RLS → DB.
// "Users log into their tenant only" + "roles gate what each user can see/do".
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('auth + RBAC (HTTP)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'RBAC A');
    b = await makeTenant(admin, 'RBAC B');
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  const http = () => request(app.getHttpServer());

  it('rejects unauthenticated requests', async () => {
    await http().get('/api/v1/contacts').expect(401);
  });

  it('creates and lists a contact within the caller tenant', async () => {
    await http()
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${a.staffToken}`)
      .send({ displayName: 'Casey (A)', phone: '0400000000' })
      .expect(201);

    const res = await http()
      .get('/api/v1/contacts')
      .set('Authorization', `Bearer ${a.staffToken}`)
      .expect(200);
    expect(res.body.map((c: { displayName: string }) => c.displayName)).toContain('Casey (A)');
  });

  it("does not leak another tenant's contacts over HTTP", async () => {
    const res = await http()
      .get('/api/v1/contacts')
      .set('Authorization', `Bearer ${b.staffToken}`)
      .expect(200);
    expect(
      res.body.find((c: { displayName: string }) => c.displayName === 'Casey (A)'),
    ).toBeUndefined();
  });

  it('rejects unknown fields (input validation)', async () => {
    await http()
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${a.staffToken}`)
      .send({ displayName: 'x', hacker: true })
      .expect(400);
  });

  it('gates an owner-only route by role', async () => {
    await http()
      .get('/api/v1/contacts/owner-only')
      .set('Authorization', `Bearer ${a.staffToken}`)
      .expect(403);
    await http()
      .get('/api/v1/contacts/owner-only')
      .set('Authorization', `Bearer ${a.ownerToken}`)
      .expect(200);
  });
});
