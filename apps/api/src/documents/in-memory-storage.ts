import { randomUUID } from 'node:crypto';
import { DocumentStorage, DocumentStorageError } from './document-storage';

/**
 * In-memory DocumentStorage for tests + local dev (card #6.7). Enforces tenant scoping exactly like the
 * real Supabase Storage adapter must: a ref is owned by the tenant that created it, and a `get` from any
 * other tenant is rejected — a tenant can only reach its own documents.
 */
export class InMemoryDocumentStorage implements DocumentStorage {
  private readonly store = new Map<string, { tenantId: string; content: string }>();

  async put(tenantId: string, content: string): Promise<string> {
    const ref = randomUUID();
    this.store.set(ref, { tenantId, content });
    return ref;
  }

  async get(tenantId: string, ref: string): Promise<string> {
    const entry = this.store.get(ref);
    // Not-found and wrong-tenant are indistinguishable on purpose (don't leak that the ref exists).
    if (!entry || entry.tenantId !== tenantId) {
      throw new DocumentStorageError('Document not found');
    }
    return entry.content;
  }
}
