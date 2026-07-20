// Card 60.4 — similar-past-jobs retrieval end to end: index a job's scope, then find it again from a
// LATER job. The isolation case is the one that matters commercially: retrieval must never surface
// another shop's work as precedent, and a similarity query is exactly the shape that would leak if RLS
// were missing (it ranks by distance, not by owner). Runs against Supabase; skipped without a DB.
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EmbeddingIndexService } from '../src/ai/embedding-index.service';
import { SimilarJobsService } from '../src/ai/similar-jobs.service';
import { StubEmbedder } from '../src/ai/stub-embedder';
import { TenantService } from '../src/tenancy/tenant.service';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('similar past jobs (card 60.4)', () => {
  let admin: PrismaClient;
  let tenants: TenantService;
  let index: EmbeddingIndexService;
  let similar: SimilarJobsService;
  let a: TestTenant;
  let b: TestTenant;

  /**
   * A stand-in for DamageScopeService that serves whatever scope the test set for a job. The retrieval
   * behaviour under test is "given a scope, find similar ones" — going through the real AI analyzer
   * would test the analyzer instead, and couple this spec to how scopes get generated.
   */
  const scopeByJob = new Map<string, { summary: string; items: [] }>();
  const fakeScopes = {
    getForJob: async (_tenantId: string, jobId: string) =>
      scopeByJob.get(jobId) ?? { summary: '', items: [] },
  };

  const makeJob = async (tenantId: string, reference: string): Promise<string> => {
    const item = await admin.workItem.create({
      data: { tenantId, type: 'job', stateName: 'booked', workflowVersion: 1, reference },
    });
    return item.id;
  };

  beforeAll(async () => {
    admin = adminPrisma();
    tenants = new TenantService();
    index = new EmbeddingIndexService(tenants, new StubEmbedder());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow test double, see above
    similar = new SimilarJobsService(fakeScopes as any, index);
    a = await makeTenant(admin, 'Similar A');
    b = await makeTenant(admin, 'Similar B');
  });

  afterAll(async () => {
    for (const t of [a, b]) {
      await admin.$executeRaw`DELETE FROM "onestack_job_embedding" WHERE "tenantId" = ${t.tenantId}::uuid`;
      await admin.workItem.deleteMany({ where: { tenantId: t.tenantId } });
      await dropTenant(admin, t.tenantId);
    }
    await admin.$disconnect();
  });

  it('finds a past job whose scope matches the new one', async () => {
    const past = await makeJob(a.tenantId, `A-past-${Date.now()}`);
    const fresh = await makeJob(a.tenantId, `A-fresh-${Date.now()}`);
    const scope = { summary: 'Front-end collision, bumper and bonnet', items: [] as [] };
    scopeByJob.set(past, scope);
    scopeByJob.set(fresh, scope);

    expect(await similar.indexJob(a.tenantId, past)).toBe(1);

    const matches = await similar.findSimilarJobs(a.tenantId, fresh);
    expect(matches.map((m) => m.workItemId)).toContain(past);
    expect(matches[0]?.similarity).toBeGreaterThan(0.99);
    expect(matches[0]?.bestSnippet).toContain('Front-end collision');
  });

  it('never offers another shop’s job as precedent (read isolation)', async () => {
    const scope = { summary: 'Front-end collision, bumper and bonnet', items: [] as [] };
    const theirs = await makeJob(b.tenantId, `B-past-${Date.now()}`);
    const mine = await makeJob(a.tenantId, `A-query-${Date.now()}`);
    scopeByJob.set(theirs, scope);
    scopeByJob.set(mine, scope);
    await similar.indexJob(b.tenantId, theirs);

    // Shop B holds a vector for IDENTICAL text, so distance alone cannot separate the two —
    // only RLS can. Shop A must not see it, whatever it scores.
    const matches = await similar.findSimilarJobs(a.tenantId, mine);
    expect(matches.map((m) => m.workItemId)).not.toContain(theirs);
  });

  it('does not offer the job itself as its own precedent', async () => {
    const job = await makeJob(a.tenantId, `A-self-${Date.now()}`);
    scopeByJob.set(job, { summary: 'Rear quarter panel replace', items: [] });
    await similar.indexJob(a.tenantId, job);

    const matches = await similar.findSimilarJobs(a.tenantId, job);
    expect(matches.map((m) => m.workItemId)).not.toContain(job);
  });

  it('drops weak matches rather than dressing noise up as precedent', async () => {
    const job = await makeJob(a.tenantId, `A-odd-${Date.now()}`);
    // Unrelated to anything indexed. The stub sends unrelated content near-orthogonal, so every
    // candidate should fall under MIN_SIMILARITY and be filtered out.
    scopeByJob.set(job, { summary: 'Hail damage across roof and both guards, PDR', items: [] });

    const matches = await similar.findSimilarJobs(a.tenantId, job);
    expect(matches).toEqual([]);
  });

  it('skips indexing a job with no scope, so an empty job never becomes precedent', async () => {
    const job = await makeJob(a.tenantId, `A-empty-${Date.now()}`);
    scopeByJob.set(job, { summary: '', items: [] });

    expect(await similar.indexJob(a.tenantId, job)).toBe(0);
    expect(await similar.findSimilarJobs(a.tenantId, job)).toEqual([]);
  });

  it('re-indexing an unchanged scope is free', async () => {
    const job = await makeJob(a.tenantId, `A-stable-${Date.now()}`);
    scopeByJob.set(job, { summary: 'Windscreen replace', items: [] });

    expect(await similar.indexJob(a.tenantId, job)).toBe(1);
    expect(await similar.indexJob(a.tenantId, job)).toBe(0);
  });
});
