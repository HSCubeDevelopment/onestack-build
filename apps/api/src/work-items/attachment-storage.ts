import { randomUUID } from 'node:crypto';

/**
 * Binary storage for work-item attachments (card #21). Keyed by tenantId so every implementation MUST
 * scope access — a tenant can only reach files under its own prefix (defence in depth alongside the DB
 * row's RLS). Two implementations: Supabase Storage (production) and in-memory (tests without a bucket).
 */
export interface AttachmentStorage {
  /** Store bytes for a tenant; returns an opaque, tenant-prefixed storage ref. */
  put(tenantId: string, bytes: Buffer, contentType: string): Promise<string>;
  /** Fetch bytes by ref for a tenant. Throws if the ref doesn't belong to that tenant. */
  get(tenantId: string, ref: string): Promise<Buffer>;
  /** Best-effort delete. */
  remove(tenantId: string, ref: string): Promise<void>;
}

export class AttachmentStorageError extends Error {}

export const ATTACHMENT_STORAGE = Symbol('ATTACHMENT_STORAGE');

/** In-memory store — used when no Supabase bucket is configured (pure-unit runs). */
export class InMemoryAttachmentStorage implements AttachmentStorage {
  private readonly files = new Map<string, Buffer>();

  async put(tenantId: string, bytes: Buffer, _contentType: string): Promise<string> {
    const ref = `${tenantId}/${randomUUID()}`;
    this.files.set(ref, bytes);
    return ref;
  }

  async get(tenantId: string, ref: string): Promise<Buffer> {
    if (!ref.startsWith(`${tenantId}/`)) throw new AttachmentStorageError('Attachment not found');
    const bytes = this.files.get(ref);
    if (!bytes) throw new AttachmentStorageError('Attachment not found');
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
export class SupabaseAttachmentStorage implements AttachmentStorage {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceRoleKey: string,
    private readonly bucket: string,
  ) {}

  static fromEnv(): SupabaseAttachmentStorage | null {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const bucket = process.env.SUPABASE_DOCUMENTS_BUCKET ?? 'onestack_documents';
    if (!url || !key) return null;
    return new SupabaseAttachmentStorage(url, key, bucket);
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
      throw new AttachmentStorageError(`Storage put failed (${res.status}): ${await res.text()}`);
    return path;
  }

  async get(tenantId: string, ref: string): Promise<Buffer> {
    if (!ref.startsWith(`${tenantId}/`)) throw new AttachmentStorageError('Attachment not found');
    const res = await fetch(`${this.baseUrl}/storage/v1/object/${this.bucket}/${ref}`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new AttachmentStorageError('Attachment not found');
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
