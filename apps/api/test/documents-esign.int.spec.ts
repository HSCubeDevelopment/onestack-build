// Phase 3 — Documents & e-signature (card #143). Generate a document from a template, request an
// e-signature (unguessable public link = secure exchange), open the public sign page, and sign by
// typed-name acknowledgement. Certified/legally-binding e-sign is a deferred vendor. Tenant-isolated.
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/main';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('Documents & e-signature (Phase 3)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let a: TestTenant;
  let b: TestTenant;
  let documentId: string;
  let token: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: TestTenant) => ({ Authorization: `Bearer ${t.ownerToken}` });

  const generateDoc = (t: TestTenant) =>
    http()
      .post('/api/v1/documents')
      .set(auth(t))
      .send({
        type: 'authority-to-proceed',
        parentType: 'work_item',
        parentId: '11111111-1111-1111-1111-111111111111',
        templateRef: 'authority',
        body: 'I authorise {{shop}} to proceed with repairs.',
        data: { shop: 'Panel Co' },
      })
      .expect(201);

  beforeAll(async () => {
    admin = adminPrisma();
    a = await makeTenant(admin, 'Doc A');
    b = await makeTenant(admin, 'Doc B');
    app = await createApp();
    await app.init();
    documentId = (await generateDoc(a)).body.id;
  });

  afterAll(async () => {
    await app.close();
    for (const t of [a.tenantId, b.tenantId]) {
      for (const tbl of ['onestack_document_signature', 'onestack_document']) {
        await admin.$executeRawUnsafe(`DELETE FROM "${tbl}" WHERE "tenantId" = $1::uuid`, t);
      }
    }
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  it('generates a document and requests an e-signature with a public sign link', async () => {
    const sig = (
      await http()
        .post(`/api/v1/documents/${documentId}/signature-request`)
        .set(auth(a))
        .send({ signerName: 'Jane Customer', signerEmail: 'jane@example.com' })
        .expect(201)
    ).body;
    expect(sig.status).toBe('pending');
    expect(sig.certified).toBe(false); // built-in acknowledgement, not a certified vendor
    expect(sig.signUrl).toMatch(/^\/public\/documents\/sign\/[a-f0-9]+$/);
    token = sig.signUrl.split('/').pop();
  });

  it('opens the public sign page (no auth) and shows the document to review', async () => {
    const page = (await http().get(`/api/v1/public/documents/sign/${token}`).expect(200)).body;
    expect(page.status).toBe('pending');
    expect(page.signerName).toBe('Jane Customer');
    expect(page.content).toContain('I authorise Panel Co to proceed');
    expect(page.certified).toBe(false);
  });

  it('records a typed-name signature; a second attempt conflicts', async () => {
    const res = (
      await http()
        .post(`/api/v1/public/documents/sign/${token}`)
        .send({ signedName: 'Jane Customer' })
        .expect(201)
    ).body;
    expect(res.status).toBe('signed');

    // Owner sees it as signed.
    const list = (
      await http().get(`/api/v1/documents/${documentId}/signatures`).set(auth(a)).expect(200)
    ).body;
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe('signed');
    expect(list[0].signedName).toBe('Jane Customer');

    // Signing again is rejected.
    await http()
      .post(`/api/v1/public/documents/sign/${token}`)
      .send({ signedName: 'Jane Customer' })
      .expect(409);
  });

  it('ignores a honeypot submission on a fresh request', async () => {
    const doc2 = (await generateDoc(a)).body.id;
    const sig = (
      await http()
        .post(`/api/v1/documents/${doc2}/signature-request`)
        .set(auth(a))
        .send({ signerName: 'Bot Target' })
        .expect(201)
    ).body;
    const t2 = sig.signUrl.split('/').pop();
    await http()
      .post(`/api/v1/public/documents/sign/${t2}`)
      .send({ website: 'http://spam', signedName: 'bot' })
      .expect(201);
    // Still pending — nothing recorded.
    expect((await http().get(`/api/v1/public/documents/sign/${t2}`).expect(200)).body.status).toBe(
      'pending',
    );
  });

  it("is tenant-isolated: shop B can't sign-request or list shop A's document", async () => {
    await http()
      .post(`/api/v1/documents/${documentId}/signature-request`)
      .set(auth(b))
      .send({ signerName: 'Mallory' })
      .expect(404);
    await http().get(`/api/v1/documents/${documentId}/signatures`).set(auth(b)).expect(200).expect((r) => {
      if (r.body.length !== 0) throw new Error('shop B should see no signatures on A document');
    });
    await http().get(`/api/v1/documents/${documentId}/content`).set(auth(b)).expect(404);
  });
});
