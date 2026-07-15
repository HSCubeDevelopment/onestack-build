import { randomUUID } from 'node:crypto';

/**
 * Binary storage for fleet before/after photos. Keyed by tenantId so every implementation MUST scope
 * access — a tenant can only reach files under its own `<tenantId>/…` prefix (defence in depth alongside
 * the DB row's RLS). Mirrors work-items' attachment storage; kept self-contained so the fleet module does
 * not import another module's files (could later be promoted to a shared core provider under review).
 * Two implementations: Supabase Storage (production) and in-memory (tests without a bucket).
 */
export interface FleetPhotoStorage {
  put(tenantId: string, bytes: Buffer, contentType: string): Promise<string>;
  get(tenantId: string, ref: string): Promise<Buffer>;
  remove(tenantId: string, ref: string): Promise<void>;
}

export class FleetPhotoStorageError extends Error {}

export const FLEET_PHOTO_STORAGE = Symbol('FLEET_PHOTO_STORAGE');

/** In-memory store — used when no Supabase bucket is configured (pure-unit runs). */
export class InMemoryFleetPhotoStorage implements FleetPhotoStorage {
  private readonly files = new Map<string, Buffer>();

  async put(tenantId: string, bytes: Buffer, _contentType: string): Promise<string> {
    const ref = `${tenantId}/${randomUUID()}`;
    this.files.set(ref, bytes);
    return ref;
  }

  async get(tenantId: string, ref: string): Promise<Buffer> {
    if (!ref.startsWith(`${tenantId}/`)) throw new FleetPhotoStorageError('Photo not found');
    const bytes = this.files.get(ref);
    if (!bytes) throw new FleetPhotoStorageError('Photo not found');
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
export class SupabaseFleetPhotoStorage implements FleetPhotoStorage {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceRoleKey: string,
    private readonly bucket: string,
  ) {}

  static fromEnv(): SupabaseFleetPhotoStorage | null {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const bucket = process.env.SUPABASE_DOCUMENTS_BUCKET ?? 'onestack_documents';
    if (!url || !key) return null;
    return new SupabaseFleetPhotoStorage(url, key, bucket);
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
      throw new FleetPhotoStorageError(`Storage put failed (${res.status}): ${await res.text()}`);
    return path;
  }

  async get(tenantId: string, ref: string): Promise<Buffer> {
    if (!ref.startsWith(`${tenantId}/`)) throw new FleetPhotoStorageError('Photo not found');
    const res = await fetch(`${this.baseUrl}/storage/v1/object/${this.bucket}/${ref}`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new FleetPhotoStorageError('Photo not found');
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
