// Cards 60.4 + 60.5 — retrieval end to end: index a job, then find it again from a LATER job, by scope
// text and by photo. The isolation case is the one that matters commercially: retrieval must never
// surface another shop's work as precedent, and a similarity query is exactly the shape that would leak
// if RLS were missing (it ranks by distance, not by owner). Runs against Supabase; skipped without a DB.
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EmbeddingIndexService } from '../src/ai/embedding-index.service';
import {
  IndexablePhoto,
  ScopeForComparison,
  SimilarJobsService,
} from '../src/ai/similar-jobs.service';
import { StubEmbedder } from '../src/ai/stub-embedder';
import { TenantService } from '../src/tenancy/tenant.service';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('similar past jobs (cards 60.4 + 60.5)', () => {
  let admin: PrismaClient;
  let similar: SimilarJobsService;
  let a: TestTenant;
  let b: TestTenant;

  const scope = (summary: string): ScopeForComparison => ({ summary, items: [] });

  const photo = (attachmentId: string, dataBase64: string): IndexablePhoto => ({
    attachmentId,
    contentType: 'image/jpeg',
    dataBase64,
  });

  const makeJob = async (tenantId: string, reference: string): Promise<string> => {
    const item = await admin.workItem.create({
      data: { tenantId, type: 'job', stateName: 'booked', workflowVersion: 1, reference },
    });
    return item.id;
  };

  beforeAll(async () => {
    admin = adminPrisma();
    similar = new SimilarJobsService(
      new EmbeddingIndexService(new TenantService(), new StubEmbedder()),
    );
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
    const s = scope('Front-end collision, bumper and bonnet');

    expect(await similar.indexJob(a.tenantId, past, s)).toBe(1);

    const matches = await similar.findSimilarJobs(a.tenantId, fresh, s);
    expect(matches.map((m) => m.workItemId)).toContain(past);
    expect(matches[0]?.similarity).toBeGreaterThan(0.99);
    expect(matches[0]?.bestSnippet).toContain('Front-end collision');
  });

  it('never offers another shop’s job as precedent (read isolation)', async () => {
    const s = scope('Front-end collision, bumper and bonnet');
    const theirs = await makeJob(b.tenantId, `B-past-${Date.now()}`);
    const mine = await makeJob(a.tenantId, `A-query-${Date.now()}`);
    await similar.indexJob(b.tenantId, theirs, s);

    // Shop B holds a vector for IDENTICAL text, so distance alone cannot separate the two —
    // only RLS can. Shop A must not see it, whatever it scores.
    const matches = await similar.findSimilarJobs(a.tenantId, mine, s);
    expect(matches.map((m) => m.workItemId)).not.toContain(theirs);
  });

  it('does not offer the job itself as its own precedent', async () => {
    const job = await makeJob(a.tenantId, `A-self-${Date.now()}`);
    const s = scope('Rear quarter panel replace');
    await similar.indexJob(a.tenantId, job, s);

    const matches = await similar.findSimilarJobs(a.tenantId, job, s);
    expect(matches.map((m) => m.workItemId)).not.toContain(job);
  });

  it('drops weak matches rather than dressing noise up as precedent', async () => {
    const job = await makeJob(a.tenantId, `A-odd-${Date.now()}`);
    // Unrelated to anything indexed. The stub sends unrelated content near-orthogonal, so every
    // candidate should fall under MIN_SIMILARITY and be filtered out.
    const matches = await similar.findSimilarJobs(
      a.tenantId,
      job,
      scope('Hail damage across roof and both guards, PDR'),
    );
    expect(matches).toEqual([]);
  });

  it('skips indexing a job with no scope, so an empty job never becomes precedent', async () => {
    const job = await makeJob(a.tenantId, `A-empty-${Date.now()}`);
    expect(await similar.indexJob(a.tenantId, job, scope(''))).toBe(0);
    expect(await similar.findSimilarJobs(a.tenantId, job, scope(''))).toEqual([]);
  });

  it('re-indexing an unchanged job is free', async () => {
    const job = await makeJob(a.tenantId, `A-stable-${Date.now()}`);
    const s = scope('Windscreen replace');
    expect(await similar.indexJob(a.tenantId, job, s)).toBe(1);
    expect(await similar.indexJob(a.tenantId, job, s)).toBe(0);
  });

  // ---------------------------------------------------------------- card 60.5: retrieval by photo

  it('indexes a job’s photos alongside its scope', async () => {
    const job = await makeJob(a.tenantId, `A-photos-${Date.now()}`);
    // One scope piece + two photo pieces.
    const written = await similar.indexJob(a.tenantId, job, scope('Left guard replace'), [
      photo('11111111-1111-4111-8111-111111111111', 'PHOTO-AAA'),
      photo('22222222-2222-4222-8222-222222222222', 'PHOTO-BBB'),
    ]);
    expect(written).toBe(3);
  });

  it('finds a past job from a NEW job’s photo, when there is no scope to query with', async () => {
    // This is the 60.5 case: a job being scoped for the first time has photos and nothing else.
    const past = await makeJob(a.tenantId, `A-pastphoto-${Date.now()}`);
    const fresh = await makeJob(a.tenantId, `A-freshphoto-${Date.now()}`);
    const shot = photo('33333333-3333-4333-8333-333333333333', 'PHOTO-SHARED');

    await similar.indexJob(a.tenantId, past, scope('Rear bumper replace, tow bar refit'), [shot]);

    const matches = await similar.findSimilarByPhotos(a.tenantId, fresh, [shot]);
    expect(matches.map((m) => m.workItemId)).toContain(past);
    // The snippet carries the past job's SCOPE, not the photo — that's what a human can act on.
    expect(matches[0]?.bestSnippet).toContain('Rear bumper replace');
  });

  it('returns nothing when the new job has no photos', async () => {
    const job = await makeJob(a.tenantId, `A-nophoto-${Date.now()}`);
    expect(await similar.findSimilarByPhotos(a.tenantId, job, [])).toEqual([]);
  });

  it('never offers another shop’s job as photo precedent (read isolation)', async () => {
    const shot = photo('44444444-4444-4444-8444-444444444444', 'PHOTO-CROSS');
    const theirs = await makeJob(b.tenantId, `B-photo-${Date.now()}`);
    const mine = await makeJob(a.tenantId, `A-photoq-${Date.now()}`);
    await similar.indexJob(b.tenantId, theirs, scope('Bonnet respray'), [shot]);

    // Identical photo bytes in both shops — again only RLS separates them.
    const matches = await similar.findSimilarByPhotos(a.tenantId, mine, [shot]);
    expect(matches.map((m) => m.workItemId)).not.toContain(theirs);
  });
});
