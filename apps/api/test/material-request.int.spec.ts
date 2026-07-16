// Phase 2 — Floor ordering. A technician (STAFF) raises a material request for a job; a manager (OWNER)
// approves or rejects it; an approved request can be ordered (emailed to a supplier — vendor boundary,
// no-op). The manager step is role-gated. Tenant-isolated.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Floor ordering — material requests (Phase 2)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let jobId: string;
  let reqId: string;

  const http = () => request(app.getHttpServer());
  const staff = (t: TestTenant) => ({ Authorization: `Bearer ${t.staffToken}` });
  const owner = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  const makeJob = async (t: TestTenant): Promise<string> => {
    const customerId = (
      await http()
        .post('/api/v1/contacts')
        .set(owner(t))
        .send({ displayName: 'MR Cust', phone: '0400333444' })
    ).body.id;
    const vehicleId = (
      await http()
        .post(`/api/v1/contacts/${customerId}/vehicles`)
        .set(owner(t))
        .send({ rego: 'MR1', make: 'Holden', model: 'Astra', year: 2018 })
    ).body.id;
    return (
      await http()
        .post('/api/v1/work-items')
        .set(owner(t))
        // Dispatched to the technician: a STAFF caller may only raise parts against a job assigned to
        // them, so the job has to be theirs for the technician flow below to be reachable.
        .send({
          type: 'job',
          fields: { customerId },
          subjectIds: [vehicleId],
          assignees: [t.staffUserId],
        })
    ).body.id;
  };

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'MR A');
    b = await makeTenant(admin, 'MR B');
    app = await createApp();
    await app.init();
    jobId = await makeJob(a);
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      for (const tbl of [
        'onestack_material_request_line',
        'onestack_material_request',
        'onestack_reference_counter',
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

  it('a technician (STAFF) raises a material request', async () => {
    const req = (
      await http()
        .post(`/api/v1/work-items/${jobId}/material-requests`)
        .set(staff(a))
        .send({
          notes: 'Ran low mid-job',
          lines: [
            { description: 'Primer', quantity: 2 },
            { description: 'Masking tape', quantity: 5, notes: '48mm' },
          ],
        })
        .expect(201)
    ).body;
    reqId = req.id;

    expect(req.status).toBe('requested');
    expect(req.reference).toMatch(/^MR-\d{6}$/);
    expect(req.requestedByUserId).toBe(a.staffUserId);
    expect(req.lines).toHaveLength(2);
    expect(req.lines[0].quantity).toBe(2);
  });

  it('rejects an empty request', async () => {
    await http()
      .post(`/api/v1/work-items/${jobId}/material-requests`)
      .set(staff(a))
      .send({ lines: [] })
      .expect(400);
  });

  it('a technician cannot approve — only a manager (OWNER) can', async () => {
    await http().post(`/api/v1/material-requests/${reqId}/approve`).set(staff(a)).expect(403);
  });

  it('a manager approves the request; a second decision is refused', async () => {
    const approved = (
      await http()
        .post(`/api/v1/material-requests/${reqId}/approve`)
        .set(owner(a))
        .send({ note: 'Approved — proceed' })
        .expect(201)
    ).body;
    expect(approved.status).toBe('approved');
    expect(approved.decidedByUserId).toBe(a.ownerUserId);
    expect(approved.decisionNote).toBe('Approved — proceed');

    // Already decided — can't approve/reject again.
    await http().post(`/api/v1/material-requests/${reqId}/reject`).set(owner(a)).expect(409);
  });

  it('ordering an approved request reports the supplier was not emailed (no provider)', async () => {
    const ordered = (
      await http().post(`/api/v1/material-requests/${reqId}/order`).set(owner(a)).expect(201)
    ).body;
    expect(ordered.result.emailed).toBe(false);
    expect(ordered.result.reason).toMatch(/no email provider/i);
    expect(ordered.request.status).toBe('approved'); // NOT 'ordered' until a real send succeeds
  });

  it('a rejected request cannot be ordered', async () => {
    const second = (
      await http()
        .post(`/api/v1/work-items/${jobId}/material-requests`)
        .set(staff(a))
        .send({ lines: [{ description: 'Filler' }] })
        .expect(201)
    ).body;
    await http()
      .post(`/api/v1/material-requests/${second.id}/reject`)
      .set(owner(a))
      .send({ note: 'Use existing stock' })
      .expect(201);
    await http().post(`/api/v1/material-requests/${second.id}/order`).set(owner(a)).expect(409);
  });

  it("is tenant-isolated: shop B cannot create, read, approve, or order shop A's requests", async () => {
    // B can't raise a request against A's job.
    await http()
      .post(`/api/v1/work-items/${jobId}/material-requests`)
      .set(owner(b))
      .send({ lines: [{ description: 'x' }] })
      .expect(404);
    // B can't read A's requests.
    await http().get(`/api/v1/work-items/${jobId}/material-requests`).set(owner(b)).expect(404);
    await http().get(`/api/v1/material-requests/${reqId}`).set(owner(b)).expect(404);
    // B is an OWNER (passes the role gate) but the request isn't theirs → 404, not a cross-tenant decision.
    await http().post(`/api/v1/material-requests/${reqId}/approve`).set(owner(b)).expect(404);
    await http().post(`/api/v1/material-requests/${reqId}/order`).set(owner(b)).expect(404);
  });
});
