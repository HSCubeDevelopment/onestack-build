// Fleet photo storage — the filesystem implementation used for local development. No DB.
// The security-relevant behaviour is that a ref can never escape its own tenant directory: the prefix
// check and the resolved-path check catch different attacks, so both are exercised here.
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FilesystemFleetPhotoStorage,
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
