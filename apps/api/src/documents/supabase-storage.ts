import { randomUUID } from 'node:crypto';
import { DocumentStorage, DocumentStorageError } from './document-storage';

/**
 * Supabase Storage implementation of DocumentStorage (card #6.7). Files are stored under a per-tenant
 * path prefix (`<tenantId>/<uuid>`), and `get` refuses any ref that isn't under the caller's tenant
 * prefix — so storage access is tenant-scoped (defence in depth alongside the DB row's RLS). Uses the
 * service-role key; the bucket is private.
 */
export class SupabaseDocumentStorage implements DocumentStorage {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceRoleKey: string,
    private readonly bucket: string,
  ) {}

  static fromEnv(): SupabaseDocumentStorage {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const bucket = process.env.SUPABASE_DOCUMENTS_BUCKET ?? 'onestack_documents';
    if (!url || !key)
      throw new DocumentStorageError('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
    return new SupabaseDocumentStorage(url, key, bucket);
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Authorization: `Bearer ${this.serviceRoleKey}`,
      apikey: this.serviceRoleKey,
      ...extra,
    };
  }

  async put(tenantId: string, content: string, contentType: string): Promise<string> {
    const path = `${tenantId}/${randomUUID()}`;
    const res = await fetch(`${this.baseUrl}/storage/v1/object/${this.bucket}/${path}`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': contentType, 'x-upsert': 'true' }),
      body: content,
    });
    if (!res.ok) {
      throw new DocumentStorageError(`Storage put failed (${res.status}): ${await res.text()}`);
    }
    return path; // the ref is the tenant-prefixed path
  }

  async get(tenantId: string, ref: string): Promise<string> {
    // Tenant scoping: a ref must live under the caller's tenant prefix.
    if (!ref.startsWith(`${tenantId}/`)) throw new DocumentStorageError('Document not found');
    const res = await fetch(`${this.baseUrl}/storage/v1/object/${this.bucket}/${ref}`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new DocumentStorageError('Document not found');
    return res.text();
  }
}
