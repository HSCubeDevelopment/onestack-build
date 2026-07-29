import { randomUUID } from 'node:crypto';

/**
 * Binary storage for the original ticket file — a photo of the notice OR the notice PDF. Keyed by tenantId
 * so every implementation MUST scope access: a tenant can only reach files under its own `<tenantId>/…`
 * prefix (defence in depth alongside the DB row's RLS). Mirrors the fleet photo storage, kept self-contained
 * so the tickets module does not import another module's files. Two implementations: Supabase Storage
 * (production) and in-memory (tests without a bucket). Unlike the photo store, this accepts PDFs too.
 */
export interface TicketFileStorage {
  put(tenantId: string, bytes: Buffer, contentType: string): Promise<string>;
  get(tenantId: string, ref: string): Promise<Buffer>;
  remove(tenantId: string, ref: string): Promise<void>;
}

export class TicketFileStorageError extends Error {}

export const TICKET_FILE_STORAGE = Symbol('TICKET_FILE_STORAGE');

/** In-memory store — used when no Supabase bucket is configured (pure-unit runs). */
export class InMemoryTicketFileStorage implements TicketFileStorage {
  private readonly files = new Map<string, Buffer>();

  async put(tenantId: string, bytes: Buffer, _contentType: string): Promise<string> {
    const ref = `${tenantId}/${randomUUID()}`;
    this.files.set(ref, bytes);
    return ref;
  }

  async get(tenantId: string, ref: string): Promise<Buffer> {
    if (!ref.startsWith(`${tenantId}/`)) throw new TicketFileStorageError('File not found');
    const bytes = this.files.get(ref);
    if (!bytes) throw new TicketFileStorageError('File not found');
    return bytes;
  }

  async remove(tenantId: string, ref: string): Promise<void> {
    if (ref.startsWith(`${tenantId}/`)) this.files.delete(ref);
  }
}

/**
 * Supabase Storage implementation. Files live under `<tenantId>/<uuid>` in a PRIVATE bucket, reached with
 * the service-role key. `get`/`remove` refuse any ref not under the caller's tenant prefix.
 */
export class SupabaseTicketFileStorage implements TicketFileStorage {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceRoleKey: string,
    private readonly bucket: string,
  ) {}

  static fromEnv(): SupabaseTicketFileStorage | null {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const bucket = process.env.SUPABASE_DOCUMENTS_BUCKET ?? 'onestack_documents';
    if (!url || !key) return null;
    return new SupabaseTicketFileStorage(url, key, bucket);
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Authorization: `Bearer ${this.serviceRoleKey}`,
      apikey: this.serviceRoleKey,
      ...extra,
    };
  }

  async put(tenantId: string, bytes: Buffer, contentType: string): Promise<string> {
    const path = `${tenantId}/${randomUUID()}`;
    const res = await fetch(`${this.baseUrl}/storage/v1/object/${this.bucket}/${path}`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': contentType, 'x-upsert': 'true' }),
      body: new Uint8Array(bytes),
    });
    if (!res.ok)
      throw new TicketFileStorageError(`Storage put failed (${res.status}): ${await res.text()}`);
    return path;
  }

  async get(tenantId: string, ref: string): Promise<Buffer> {
    if (!ref.startsWith(`${tenantId}/`)) throw new TicketFileStorageError('File not found');
    const res = await fetch(`${this.baseUrl}/storage/v1/object/${this.bucket}/${ref}`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new TicketFileStorageError('File not found');
    return Buffer.from(await res.arrayBuffer());
  }

  async remove(tenantId: string, ref: string): Promise<void> {
    if (!ref.startsWith(`${tenantId}/`)) return;
    await fetch(`${this.baseUrl}/storage/v1/object/${this.bucket}/${ref}`, {
      method: 'DELETE',
      headers: this.headers(),
    });
  }
}
