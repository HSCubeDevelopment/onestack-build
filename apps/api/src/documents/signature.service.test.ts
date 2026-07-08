import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { NoopESignatureProvider } from './esignature-provider';
import { SignatureService } from './signature.service';

// Fakes — no DB. A shared in-memory store backs both the tenant-scoped tx and the admin (token) prisma.
function makeService(opts?: {
  documents?: Array<{ id: string; type: string; storageRef: string }>;
  provider?: NoopESignatureProvider;
  content?: string;
}) {
  const docs = opts?.documents ?? [{ id: 'doc1', type: 'quote', storageRef: 'ref1' }];
  const sigs: Array<Record<string, unknown>> = [];

  const tx = {
    document: { findFirst: async ({ where }: { where: { id: string } }) => docs.find((d) => d.id === where.id) ?? null },
    documentSignature: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `sig${sigs.length + 1}`, createdAt: new Date('2026-07-08T00:00:00Z'), signedName: null, signedAt: null, signerEmail: null, ...data };
        sigs.push(row);
        return row;
      },
      findMany: async ({ where }: { where: { documentId: string } }) =>
        sigs.filter((s) => s.documentId === where.documentId),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = sigs.find((s) => s.id === where.id);
        Object.assign(row as object, data);
        return row;
      },
    },
  };
  const tenants = { runInTenant: (_t: string, fn: (tx: unknown) => unknown) => fn(tx) };
  // Admin prisma resolves a signature by token from the same in-memory store (BYPASSRLS in prod).
  const prisma = {
    documentSignature: {
      findFirst: async ({ where }: { where: { token: string } }) => sigs.find((s) => s.token === where.token) ?? null,
    },
  };
  const storage = { put: async () => 'ref1', get: async () => opts?.content ?? 'DOCUMENT BODY' };
  const provider = opts?.provider ?? new NoopESignatureProvider();
  const service = new SignatureService(tenants as never, prisma as never, storage as never, provider);
  return { service, sigs };
}

describe('NoopESignatureProvider', () => {
  it('is a non-certified acknowledgement', async () => {
    const r = await new NoopESignatureProvider().request({ documentId: 'd', signerName: 'A', token: 't' });
    expect(r.provider).toBe('noop');
    expect(r.certified).toBe(false);
  });
});

describe('SignatureService.request', () => {
  it('creates a pending signature with a public sign link', async () => {
    const { service } = makeService();
    const view = await service.request('t1', 'doc1', { signerName: 'Jane Doe' }, 'u1');
    expect(view.status).toBe('pending');
    expect(view.certified).toBe(false);
    expect(view.signUrl).toMatch(/^\/public\/documents\/sign\/[a-f0-9]+$/);
  });

  it('rejects a blank signer name', async () => {
    const { service } = makeService();
    await expect(service.request('t1', 'doc1', { signerName: '  ' }, 'u1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('404s when the document is not the tenant', async () => {
    const { service } = makeService();
    await expect(service.request('t1', 'nope', { signerName: 'Jane' }, 'u1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('SignatureService public sign flow', () => {
  it('shows the document on the public page, then records a typed-name signature', async () => {
    const { service } = makeService();
    const req = await service.request('t1', 'doc1', { signerName: 'Jane Doe' }, 'u1');
    const token = req.signUrl.split('/').pop() as string;

    const page = await service.publicPage(token);
    expect(page.status).toBe('pending');
    expect(page.content).toBe('DOCUMENT BODY');
    expect(page.certified).toBe(false);

    const res = await service.sign(token, { signedName: 'Jane Doe' });
    expect(res.status).toBe('signed');

    // Signing again is a conflict.
    await expect(service.sign(token, { signedName: 'Jane Doe' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('supports declining', async () => {
    const { service } = makeService();
    const req = await service.request('t1', 'doc1', { signerName: 'Jane' }, 'u1');
    const token = req.signUrl.split('/').pop() as string;
    const res = await service.sign(token, { decline: true });
    expect(res.status).toBe('declined');
  });

  it('ignores a honeypot submission without recording anything', async () => {
    const { service } = makeService();
    const req = await service.request('t1', 'doc1', { signerName: 'Jane' }, 'u1');
    const token = req.signUrl.split('/').pop() as string;
    await service.sign(token, { website: 'http://spam', signedName: 'bot' });
    // Still pending — the honeypot short-circuited.
    expect((await service.publicPage(token)).status).toBe('pending');
  });

  it('rejects an empty typed name and 404s an unknown token', async () => {
    const { service } = makeService();
    const req = await service.request('t1', 'doc1', { signerName: 'Jane' }, 'u1');
    const token = req.signUrl.split('/').pop() as string;
    await expect(service.sign(token, {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.publicPage('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
