import { describe, expect, it } from 'vitest';
import { DocumentService } from './document.service';
import { InMemoryDocumentStorage } from './in-memory-storage';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

function svc(): DocumentService {
  return new DocumentService(new InMemoryDocumentStorage());
}

describe('DocumentService', () => {
  const input = {
    templateRef: 'quote',
    body: 'Quote {{ ref }}: {{ total }}',
    data: { ref: 'WI-1', total: '1100' },
  };

  it('generates a document from a template + data and stores it, then fetches it back', async () => {
    const s = svc();
    const doc = await s.generate(A, input);
    expect(doc.templateRef).toBe('quote');
    expect(doc.templateVersion).toHaveLength(16);
    expect(await s.fetch(A, doc.ref)).toBe('Quote WI-1: 1100');
  });

  it('is tenant-scoped: another tenant cannot fetch the document', async () => {
    const s = svc();
    const doc = await s.generate(A, input);
    await expect(s.fetch(B, doc.ref)).rejects.toThrow();
  });

  it('generation is deterministic (same template + data → same version + content)', async () => {
    const s = svc();
    const d1 = await s.generate(A, input);
    const d2 = await s.generate(A, input);
    expect(d1.templateVersion).toBe(d2.templateVersion);
    expect(await s.fetch(A, d1.ref)).toBe(await s.fetch(A, d2.ref));
  });
});
