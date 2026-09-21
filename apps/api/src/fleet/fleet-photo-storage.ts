import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

/**
 * Binary storage for fleet before/after photos. Keyed by tenantId so every implementation MUST scope
 * access — a tenant can only reach files under its own `<tenantId>/…` prefix (defence in depth alongside
 * the DB row's RLS). Mirrors work-items' attachment storage; kept self-contained so the fleet module does
 * not import another module's files (could later be promoted to a shared core provider under review).
 * Four implementations: Supabase Storage (production), filesystem (local development against a plain
 * Postgres, where no bucket exists), in-memory (tests without a bucket), and a fallback pair that reads
 * through from Supabase to the filesystem while a partial migration is in flight.
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
 * Filesystem implementation — for local development, where there is no Supabase bucket but photos still
 * need to survive a restart (in-memory loses them). Files live under `<root>/<tenantId>/<uuid>`.
 *
 * Opt-in via FLEET_PHOTO_DIR; never selected in production, which always has SUPABASE_URL set. The refs it
 * stores are the same `<tenantId>/<uuid>` shape as Supabase, so rows are portable between the two.
 */
export class FilesystemFleetPhotoStorage implements FleetPhotoStorage {
  constructor(private readonly root: string) {}

  static fromEnv(): FilesystemFleetPhotoStorage | null {
    const dir = process.env.FLEET_PHOTO_DIR;
    if (!dir) return null;
    return new FilesystemFleetPhotoStorage(resolve(dir));
  }

  /**
   * Map a ref to an absolute path, refusing anything outside the caller's own tenant directory. The prefix
   * check alone is not enough — `<tenantId>/../../etc/passwd` passes it — so the resolved path is also
   * confined to the tenant directory, which is what actually stops traversal.
   */
  private pathFor(tenantId: string, ref: string): string {
    if (!ref.startsWith(`${tenantId}/`)) throw new FleetPhotoStorageError('Photo not found');
    const tenantRoot = resolve(this.root, tenantId);
    const full = resolve(this.root, ref);
    if (full !== tenantRoot && !full.startsWith(tenantRoot + sep))
      throw new FleetPhotoStorageError('Photo not found');
    return full;
  }

  async put(tenantId: string, bytes: Buffer, _contentType: string): Promise<string> {
    const ref = `${tenantId}/${randomUUID()}`;
    const full = this.pathFor(tenantId, ref);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, bytes);
    return ref;
  }

  async get(tenantId: string, ref: string): Promise<Buffer> {
    const full = this.pathFor(tenantId, ref);
    try {
      return await readFile(full);
    } catch {
      throw new FleetPhotoStorageError('Photo not found');
    }
  }

  async remove(tenantId: string, ref: string): Promise<void> {
    let full: string;
    try {
      full = this.pathFor(tenantId, ref);
    } catch {
      return; // Out-of-tenant refs are ignored, matching the other implementations.
    }
    await rm(full, { force: true });
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

/**
 * Reads through from a primary store to a fallback one. Exists for a partial migration: when only some
 * photos have been copied into the bucket, the rest must keep serving from wherever they already are,
 * instead of 404ing the moment SUPABASE_URL is set.
 *
 * Selected only when BOTH Supabase and the filesystem are configured, so every existing deployment
 * resolves exactly as before — production has no FLEET_PHOTO_DIR, local dev has no SUPABASE_URL.
 */
export class FallbackFleetPhotoStorage implements FleetPhotoStorage {
  constructor(
    private readonly primary: FleetPhotoStorage,
    private readonly fallback: FleetPhotoStorage,
  ) {}

  static fromEnv(): FallbackFleetPhotoStorage | null {
    const primary = SupabaseFleetPhotoStorage.fromEnv();
    const fallback = FilesystemFleetPhotoStorage.fromEnv();
    if (!primary || !fallback) return null;
    return new FallbackFleetPhotoStorage(primary, fallback);
  }

  /** New bytes only ever go to the primary — the fallback is a read-only remnant of the migration. */
  async put(tenantId: string, bytes: Buffer, contentType: string): Promise<string> {
    return this.primary.put(tenantId, bytes, contentType);
  }

  /**
   * Falls back ONLY on FleetPhotoStorageError, which the stores throw for a genuine miss. A network
   * failure surfaces as a raw fetch TypeError and is deliberately left to propagate: swallowing it too
   * would turn a Supabase outage into "everything quietly served off one machine's disk", which looks
   * healthy and is impossible to diagnose. A miss is a miss; an outage should be loud.
   */
  async get(tenantId: string, ref: string): Promise<Buffer> {
    try {
      return await this.primary.get(tenantId, ref);
    } catch (err) {
      if (!(err instanceof FleetPhotoStorageError)) throw err;
      return this.fallback.get(tenantId, ref);
    }
  }

  /**
   * Removes from both. Deleting only the primary would let the next read resurrect the photo from the
   * fallback — a delete that does not delete.
   */
  async remove(tenantId: string, ref: string): Promise<void> {
    await this.primary.remove(tenantId, ref);
    await this.fallback.remove(tenantId, ref).catch(() => {});
  }
}
