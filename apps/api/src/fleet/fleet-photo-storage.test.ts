// Fleet photo storage — the filesystem implementation used for local development. No DB.
// The security-relevant behaviour is that a ref can never escape its own tenant directory: the prefix
// check and the resolved-path check catch different attacks, so both are exercised here.
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FallbackFleetPhotoStorage,
  FilesystemFleetPhotoStorage,
  type FleetPhotoStorage,
  FleetPhotoStorageError,
  InMemoryFleetPhotoStorage,
} from './fleet-photo-storage';

const TENANT_A = '0d15ea5e-0000-4000-8000-000000000001';
const TENANT_B = '0d15ea5e-0000-4000-8000-0000000000ff';

describe('FilesystemFleetPhotoStorage', () => {
  let root: string;
  let store: FilesystemFleetPhotoStorage;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'fleet-photos-'));
    store = new FilesystemFleetPhotoStorage(root);
  });

  it('round-trips bytes and returns a tenant-prefixed ref', async () => {
    const ref = await store.put(TENANT_A, Buffer.from('jpeg-bytes'), 'image/jpeg');
    expect(ref.startsWith(`${TENANT_A}/`)).toBe(true);
    expect((await store.get(TENANT_A, ref)).toString()).toBe('jpeg-bytes');
  });

  it('survives a new instance over the same root (unlike in-memory)', async () => {
    const ref = await store.put(TENANT_A, Buffer.from('persisted'), 'image/jpeg');
    const reopened = new FilesystemFleetPhotoStorage(root);
    expect((await reopened.get(TENANT_A, ref)).toString()).toBe('persisted');
  });

  it("refuses to read another tenant's ref", async () => {
    const ref = await store.put(TENANT_A, Buffer.from('secret'), 'image/jpeg');
    await expect(store.get(TENANT_B, ref)).rejects.toBeInstanceOf(FleetPhotoStorageError);
  });

  it('refuses a traversal ref that still carries the tenant prefix', async () => {
    await writeFile(join(root, 'outside.txt'), 'not-a-photo');
    // Passes startsWith(`${tenant}/`) but resolves outside the tenant directory.
    await expect(store.get(TENANT_A, `${TENANT_A}/../outside.txt`)).rejects.toBeInstanceOf(
      FleetPhotoStorageError,
    );
  });

  it('does not delete outside the tenant directory', async () => {
    const victim = join(root, 'keep.txt');
    await writeFile(victim, 'keep-me');
    await store.remove(TENANT_A, `${TENANT_A}/../keep.txt`);
    expect((await readFile(victim)).toString()).toBe('keep-me');
  });

  it('removes its own photo and then reports it missing', async () => {
    const ref = await store.put(TENANT_A, Buffer.from('bye'), 'image/jpeg');
    await store.remove(TENANT_A, ref);
    await expect(store.get(TENANT_A, ref)).rejects.toBeInstanceOf(FleetPhotoStorageError);
  });

  it('reports a missing file rather than throwing a raw fs error', async () => {
    await expect(store.get(TENANT_A, `${TENANT_A}/nope`)).rejects.toBeInstanceOf(
      FleetPhotoStorageError,
    );
  });

  it('reads a ref written out-of-band, which is how the import seeds photos', async () => {
    // import-innout-photos writes <root>/<tenant>/<sourcePhotoId> directly, then the SQL records the ref.
    await mkdir(join(root, TENANT_A), { recursive: true });
    await writeFile(join(root, TENANT_A, 'imported-id'), 'from-legacy');
    expect((await store.get(TENANT_A, `${TENANT_A}/imported-id`)).toString()).toBe('from-legacy');
  });

  describe('fromEnv', () => {
    const saved = process.env.FLEET_PHOTO_DIR;
    afterEach(() => {
      if (saved === undefined) delete process.env.FLEET_PHOTO_DIR;
      else process.env.FLEET_PHOTO_DIR = saved;
    });

    it('returns null when FLEET_PHOTO_DIR is unset, so the module falls through', () => {
      delete process.env.FLEET_PHOTO_DIR;
      expect(FilesystemFleetPhotoStorage.fromEnv()).toBeNull();
    });

    it('builds a store when FLEET_PHOTO_DIR is set', () => {
      process.env.FLEET_PHOTO_DIR = root;
      expect(FilesystemFleetPhotoStorage.fromEnv()).toBeInstanceOf(FilesystemFleetPhotoStorage);
    });
  });
});

describe('InMemoryFleetPhotoStorage', () => {
  it("still refuses another tenant's ref", async () => {
    const store = new InMemoryFleetPhotoStorage();
    const ref = await store.put(TENANT_A, Buffer.from('x'), 'image/jpeg');
    await expect(store.get(TENANT_B, ref)).rejects.toBeInstanceOf(FleetPhotoStorageError);
  });
});

/**
 * Minimal store whose refs are caller-chosen, so a test can say "the bucket has this exact ref and the
 * disk does not" — which is the whole point of the fallback. Enforces the same tenant-prefix rule the
 * real implementations do, so composition is exercised against realistic behaviour.
 */
class StubStore implements FleetPhotoStorage {
  readonly files = new Map<string, Buffer>();
  constructor(seeded: Record<string, string> = {}) {
    for (const [ref, body] of Object.entries(seeded)) this.files.set(ref, Buffer.from(body));
  }
  async put(tenantId: string, bytes: Buffer): Promise<string> {
    const ref = `${tenantId}/put-${this.files.size}`;
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

describe('FallbackFleetPhotoStorage', () => {
  const REF = `${TENANT_A}/photo-1`;

  it('serves from the primary and never consults the fallback', async () => {
    const store = new FallbackFleetPhotoStorage(
      new StubStore({ [REF]: 'from-bucket' }),
      new StubStore({ [REF]: 'from-disk' }),
    );
    expect((await store.get(TENANT_A, REF)).toString()).toBe('from-bucket');
  });

  it('falls back to disk when the primary misses — the migration case', async () => {
    const store = new FallbackFleetPhotoStorage(
      new StubStore(),
      new StubStore({ [REF]: 'from-disk' }),
    );
    expect((await store.get(TENANT_A, REF)).toString()).toBe('from-disk');
  });

  it('throws when neither has it', async () => {
    const store = new FallbackFleetPhotoStorage(new StubStore(), new StubStore());
    await expect(store.get(TENANT_A, REF)).rejects.toBeInstanceOf(FleetPhotoStorageError);
  });

  it('does NOT fall back when the primary fails for a non-miss reason', async () => {
    // A Supabase outage throws a raw fetch error, not FleetPhotoStorageError. Falling back would
    // silently serve stale local bytes and hide the outage.
    const outage: FleetPhotoStorage = {
      put: async () => 'unused',
      get: async () => {
        throw new TypeError('fetch failed');
      },
      remove: async () => {},
    };
    const store = new FallbackFleetPhotoStorage(outage, new StubStore({ [REF]: 'from-disk' }));
    await expect(store.get(TENANT_A, REF)).rejects.toBeInstanceOf(TypeError);
  });

  it('writes only to the primary', async () => {
    const primary = new StubStore();
    const fallback = new StubStore();
    const store = new FallbackFleetPhotoStorage(primary, fallback);
    const ref = await store.put(TENANT_A, Buffer.from('new'), 'image/jpeg');
    expect((await primary.get(TENANT_A, ref)).toString()).toBe('new');
    await expect(fallback.get(TENANT_A, ref)).rejects.toBeInstanceOf(FleetPhotoStorageError);
  });

  it('removes from both, so a delete is not undone by the fallback', async () => {
    const store = new FallbackFleetPhotoStorage(
      new StubStore({ [REF]: 'from-bucket' }),
      new StubStore({ [REF]: 'from-disk' }),
    );
    await store.remove(TENANT_A, REF);
    await expect(store.get(TENANT_A, REF)).rejects.toBeInstanceOf(FleetPhotoStorageError);
  });

  it("refuses another tenant's ref even when the fallback holds it", async () => {
    const store = new FallbackFleetPhotoStorage(
      new StubStore(),
      new StubStore({ [REF]: 'from-disk' }),
    );
    await expect(store.get(TENANT_B, REF)).rejects.toBeInstanceOf(FleetPhotoStorageError);
  });

  describe('fromEnv', () => {
    const saved = { ...process.env };
    afterEach(() => {
      process.env = { ...saved };
    });

    it('returns null with only Supabase configured, so the module falls through', () => {
      process.env.SUPABASE_URL = 'https://example.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'key';
      delete process.env.FLEET_PHOTO_DIR;
      expect(FallbackFleetPhotoStorage.fromEnv()).toBeNull();
    });

    it('returns null with only a photo directory configured', () => {
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      process.env.FLEET_PHOTO_DIR = '/tmp/fleet-photos';
      expect(FallbackFleetPhotoStorage.fromEnv()).toBeNull();
    });

    it('builds a pair when both are configured', () => {
      process.env.SUPABASE_URL = 'https://example.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'key';
      process.env.FLEET_PHOTO_DIR = '/tmp/fleet-photos';
      expect(FallbackFleetPhotoStorage.fromEnv()).toBeInstanceOf(FallbackFleetPhotoStorage);
    });
  });
});
