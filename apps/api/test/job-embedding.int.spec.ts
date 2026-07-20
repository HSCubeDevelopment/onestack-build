// Card 60.3 — the embedding index. The load-bearing test here is the isolation one: a shop's pricing
// history is the most commercially sensitive data it holds, and a similarity search is exactly the
// query shape that would quietly cross tenants if RLS were missing (it ranks by distance, not by owner).
// Runs against Supabase; skipped without a DB.
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EmbeddingIndexService, IndexablePiece } from '../src/ai/embedding-index.service';
import { StubEmbedder } from '../src/ai/stub-embedder';
import { TenantService } from '../src/tenancy/tenant.service';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('job embedding index (card 60.3)', () => {
  let admin: PrismaClient;
  let tenants: TenantService;
  let index: EmbeddingIndexService;
  let a: TestTenant;
  let b: TestTenant;
  let jobA: string;
  let jobB: string;

  /** A work item is the thing embeddings hang off; reference must be unique per tenant. */
  const makeJob = async (tenantId: string, reference: string): Promise<string> => {
    const item = await admin.workItem.create({
      data: { tenantId, type: 'job', stateName: 'booked', workflowVersion: 1, reference },
    });
    return item.id;
  };

  const scopePiece = (text: string, sourceId: string | null = null): IndexablePiece => ({
    kind: 'scope',
    sourceId,
    snippet: text.slice(0, 60),
    input: { kind: 'scope', text },
  });

  beforeAll(async () => {
    admin = adminPrisma();
    tenants = new TenantService();
    index = new EmbeddingIndexService(tenants, new StubEmbedder());
    a = await makeTenant(admin, 'Embed A');
    b = await makeTenant(admin, 'Embed B');
    jobA = await makeJob(a.tenantId, `A-${Date.now()}`);
    jobB = await makeJob(b.tenantId, `B-${Date.now()}`);
  });

  afterAll(async () => {
    // dropTenant only clears contacts + memberships, so clear what this spec created first —
    // otherwise the tenant delete fails on a foreign key.
    for (const t of [a, b]) {
      await admin.$executeRaw`DELETE FROM "onestack_job_embedding" WHERE "tenantId" = ${t.tenantId}::uuid`;
      await admin.workItem.deleteMany({ where: { tenantId: t.tenantId } });
      await dropTenant(admin, t.tenantId);
    }
    await admin.$disconnect();
  });

  it('indexes a job and finds it again by similar content', async () => {
    const written = await index.indexWorkItem(a.tenantId, jobA, [
      scopePiece('Front bumper replace, bonnet repair, left guard blend'),
    ]);
    expect(written).toBe(1);

    const hits = await index.findSimilar(a.tenantId, {
      kind: 'scope',
      text: 'Front bumper replace, bonnet repair, left guard blend',
    });
    expect(hits[0]?.workItemId).toBe(jobA);
    expect(hits[0]?.similarity).toBeGreaterThan(0.99);
  });

  it('does not surface another tenant’s jobs (read isolation)', async () => {
    const shared = 'Front bumper replace, bonnet repair, left guard blend';
    await index.indexWorkItem(b.tenantId, jobB, [scopePiece(shared)]);

    // Both tenants now hold a vector for IDENTICAL text, so distance alone cannot separate them —
    // only RLS can. B must see its own job and never A's.
    const seenByB = await index.findSimilar(b.tenantId, { kind: 'scope', text: shared });
    expect(seenByB.map((h) => h.workItemId)).toContain(jobB);
    expect(seenByB.map((h) => h.workItemId)).not.toContain(jobA);

    const seenByA = await index.findSimilar(a.tenantId, { kind: 'scope', text: shared });
    expect(seenByA.map((h) => h.workItemId)).not.toContain(jobB);
  });

  it('skips re-embedding unchanged content, and re-embeds changed content', async () => {
    const piece = scopePiece('Rear door repaint');
    const first = await index.indexWorkItem(a.tenantId, jobA, [piece]);
    expect(first).toBe(1);

    // Same content again: the content hash matches, so nothing is sent to the provider.
    expect(await index.indexWorkItem(a.tenantId, jobA, [piece])).toBe(0);

    // Changed content on the same piece: re-embedded, and REPLACES rather than duplicating.
    const changed = await index.indexWorkItem(a.tenantId, jobA, [
      scopePiece('Rear door replace, not repaint'),
    ]);
    expect(changed).toBe(1);

    const rows = await admin.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM "onestack_job_embedding"
      WHERE "workItemId" = ${jobA}::uuid AND "kind" = 'scope' AND "sourceId" IS NULL`;
    expect(Number(rows[0]?.n)).toBe(1);
  });

  it('excludes the querying job so a job is not its own "similar past job"', async () => {
    const hits = await index.findSimilar(
      a.tenantId,
      { kind: 'scope', text: 'Rear door replace, not repaint' },
      { excludeWorkItemId: jobA },
    );
    expect(hits.map((h) => h.workItemId)).not.toContain(jobA);
  });

  it('removeWorkItem clears that job’s vectors', async () => {
    const job = await makeJob(a.tenantId, `A-tmp-${Date.now()}`);
    await index.indexWorkItem(a.tenantId, job, [scopePiece('Windscreen replace')]);

    await index.removeWorkItem(a.tenantId, job);

    const rows = await admin.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM "onestack_job_embedding" WHERE "workItemId" = ${job}::uuid`;
    expect(Number(rows[0]?.n)).toBe(0);
  });
});
