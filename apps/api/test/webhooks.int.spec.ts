// Phase 4 — Public API & webhooks (card #252). Register an endpoint, deliver a SIGNED payload to a real
// local listener, and log the delivery. Tenant-isolated. (Partner API keys are deferred — auth off-limits.)
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import http from 'node:http';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Public API & webhooks (Phase 4)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let server: http.Server;
  let received: { sig: string; body: string; event: string } | null = null;
  let url = '';
  const http_ = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'WH A');
    b = await makeTenant(admin, 'WH B');
    app = await createApp();
    await app.init();
    // A real local listener that captures the delivered payload.
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        received = {
          sig: String(req.headers['x-onestack-signature'] ?? ''),
          body,
          event: String(req.headers['x-onestack-event'] ?? ''),
        };
        res.writeHead(200).end('ok');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const addr = server.address();
    url = typeof addr === 'object' && addr ? `http://127.0.0.1:${addr.port}/hook` : '';
  });

  afterAll(async () => {
    await app.close();
    await new Promise<void>((r) => server.close(() => r()));
    for (const t of [a.tenantId, b.tenantId])
      for (const tbl of ['onestack_webhook_delivery', 'onestack_webhook_endpoint'])
        await admin.$executeRawUnsafe(`DELETE FROM "${tbl}" WHERE "tenantId" = $1::uuid`, t);
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  it('registers an endpoint and delivers a correctly-signed test payload', async () => {
    const ep = (
      await http_()
        .post('/api/v1/webhooks')
        .set(auth(a))
        .send({ url, events: ['*'] })
        .expect(201)
    ).body;
    expect(ep.secret).toMatch(/^whsec_/);
    const delivery = (await http_().post(`/api/v1/webhooks/${ep.id}/test`).set(auth(a)).expect(201))
      .body;
    expect(delivery.status).toBe('success');
    expect(delivery.responseCode).toBe(200);
    // The listener received it, and the signature verifies with the endpoint secret.
    expect(received?.event).toBe('ping');
    const expected = createHmac('sha256', ep.secret).update(received!.body).digest('hex');
    expect(received?.sig).toBe(expected);
    // Delivery is logged.
    expect(
      (await http_().get(`/api/v1/webhooks/${ep.id}/deliveries`).set(auth(a)).expect(200)).body
        .length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('records a failed delivery for an unreachable URL', async () => {
    const ep = (
      await http_()
        .post('/api/v1/webhooks')
        .set(auth(a))
        .send({ url: 'http://127.0.0.1:1/dead' })
        .expect(201)
    ).body;
    const delivery = (await http_().post(`/api/v1/webhooks/${ep.id}/test`).set(auth(a)).expect(201))
      .body;
    expect(delivery.status).toBe('failed');
  });

  it("is tenant-isolated: shop B sees none of A's endpoints", async () => {
    expect((await http_().get('/api/v1/webhooks').set(auth(b)).expect(200)).body).toHaveLength(0);
  });
});
