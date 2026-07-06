// Card #6.7 persistence + storage: generate → store (Supabase Storage) → download, tenant-isolated.
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DocumentRecordService, GenerateDocInput } from '../src/documents/document-record.service';
import { SupabaseDocumentStorage } from '../src/documents/supabase-storage';
import { TenantService } from '../src/tenancy/tenant.service';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

const hasStorage =
  hasDb && Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

describe.skipIf(!hasStorage)('DocumentRecordService (Supabase Storage)', () => {
  let admin: PrismaClient;
  let svc: DocumentRecordService;
  let a: TestTenant;
  let b: TestTenant;

  const input = (): GenerateDocInput => ({
    type: 'quote',
    parentType: 'work_item',
    parentId: randomUUID(),
    templateRef: 'quote',
    body: 'Quote {{ ref }} total {{ total }}',
    data: { ref: 'WI-1', total: '1100' },
  });

  beforeAll(async () => {
    admin = adminPrisma();
    svc = new DocumentRecordService(new TenantService(), SupabaseDocumentStorage.fromEnv());
    a = await makeTenant(admin, 'Doc A');
    b = await makeTenant(admin, 'Doc B');
  });

  afterAll(async () => {
    for (const t of [a.tenantId, b.tenantId]) {
      await admin.$executeRawUnsafe(
        `DELETE FROM "onestack_document" WHERE "tenantId" = $1::uuid`,
        t,
      );
    }
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  it('generates deterministically, stores under the tenant prefix, and downloads the content', async () => {
    const doc = await svc.generate(a.tenantId, input());
    expect(doc.storageRef.startsWith(`${a.tenantId}/`)).toBe(true); // tenant-scoped storage path
    expect(doc.templateVersion).toHaveLength(16);
    expect(await svc.download(a.tenantId, doc.id)).toBe('Quote WI-1 total 1100');
  });

  it('is tenant-isolated: another tenant cannot access the document', async () => {
    const doc = await svc.generate(a.tenantId, input());
    // B can't see A's document row (RLS) → download rejects.
    await expect(svc.download(b.tenantId, doc.id)).rejects.toThrow();
  });
});
