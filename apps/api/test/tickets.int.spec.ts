// Tickets — capture an infringement notice by AI extraction, then store the confirmed ticket against a
// car. Extraction is provider-stubbed in tests (no ANTHROPIC_API_KEY), so `extract` returns a blank draft;
// the human-confirmed `create` is what persists. Everything is tenant-isolated.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Tickets (AI extraction + store)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let ticketId: string;

  // A 1x1 transparent PNG — a tiny but real image payload to store.
  const PNG_B64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  beforeAll(async () => {
    // Force the deterministic stub extractor regardless of local env — the flow needs no external API.
    delete process.env.ANTHROPIC_API_KEY;
    admin = adminPrisma();
    a = await makeTenant(admin, 'Tickets A');
    b = await makeTenant(admin, 'Tickets B');
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      await admin.$executeRawUnsafe(`DELETE FROM "onestack_ticket" WHERE "tenantId" = $1::uuid`, t);
    }
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  it('extracts an editable draft without saving (stub extractor, no external API)', async () => {
    const res = await http()
      .post('/api/v1/tickets/extract')
      .set(auth(a))
      .send({ files: [{ contentType: 'image/png', dataBase64: PNG_B64 }] })
      .expect(201);
    expect(res.body.model).toBe('stub');
    expect(res.body.extraction).toBeDefined();
    expect(res.body.extraction.notes).toMatch(/not configured/i);
    // Nothing persisted by extraction.
    expect((await http().get('/api/v1/tickets').set(auth(a)).expect(200)).body).toHaveLength(0);
  });

  it('rejects an unsupported file type', async () => {
    await http()
      .post('/api/v1/tickets/extract')
      .set(auth(a))
      .send({ files: [{ contentType: 'text/plain', dataBase64: 'aGVsbG8=' }] })
      .expect(400);
  });

  it('saves a confirmed ticket (with the original file) and lists it by rego', async () => {
    const res = await http()
      .post('/api/v1/tickets')
      .set(auth(a))
      .send({
        rego: 'bbw 027',
        noticeType: 'Notice of Final Demand',
        noticeNumber: '254790520',
        agency: 'Melbourne City Council',
        offence: 'PARKED FAIL TO PAY FEE',
        offenceDate: '18 MAR 2026',
        offenceTime: '5:33pm',
        dueDate: '10 AUG 2026',
        amountDueCents: 28680,
        source: 'pdf',
        data: { obligationNumber: '2616456356', recipientName: 'MAHAVIR INSULATION PTY LTD' },
        file: { contentType: 'image/png', dataBase64: PNG_B64 },
      })
      .expect(201);
    ticketId = res.body.id;
    expect(res.body.rego).toBe('BBW027'); // normalised
    expect(res.body.regoRaw).toBe('bbw 027');
    expect(res.body.offenceAt).toBe('18 MAR 2026 5:33pm');
    expect(res.body.amountDueCents).toBe(28680);
    expect(res.body.status).toBe('open');
    expect(res.body.hasFile).toBe(true);

    const byRego = (await http().get('/api/v1/tickets?rego=BBW027').set(auth(a)).expect(200)).body;
    expect(byRego).toHaveLength(1);
    expect(byRego[0].id).toBe(ticketId);
  });

  it('streams the stored file', async () => {
    const res = await http().get(`/api/v1/tickets/${ticketId}/file`).set(auth(a)).expect(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('changes status (mark paid)', async () => {
    const res = await http()
      .patch(`/api/v1/tickets/${ticketId}`)
      .set(auth(a))
      .send({ status: 'paid' })
      .expect(200);
    expect(res.body.status).toBe('paid');
    // Filter by status works.
    expect(
      (await http().get('/api/v1/tickets?status=paid').set(auth(a)).expect(200)).body,
    ).toHaveLength(1);
    expect(
      (await http().get('/api/v1/tickets?status=open').set(auth(a)).expect(200)).body,
    ).toHaveLength(0);
  });

  it('rejects an invalid status', async () => {
    await http()
      .patch(`/api/v1/tickets/${ticketId}`)
      .set(auth(a))
      .send({ status: 'exploded' })
      .expect(400);
  });

  it("is tenant-isolated: shop B sees none of A's tickets and cannot read A's ticket or file", async () => {
    expect((await http().get('/api/v1/tickets').set(auth(b)).expect(200)).body).toHaveLength(0);
    expect(
      (await http().get('/api/v1/tickets?rego=BBW027').set(auth(b)).expect(200)).body,
    ).toHaveLength(0);
    await http().get(`/api/v1/tickets/${ticketId}`).set(auth(b)).expect(404);
    await http().get(`/api/v1/tickets/${ticketId}/file`).set(auth(b)).expect(404);
    await http()
      .patch(`/api/v1/tickets/${ticketId}`)
      .set(auth(b))
      .send({ status: 'paid' })
      .expect(404);
  });
});
