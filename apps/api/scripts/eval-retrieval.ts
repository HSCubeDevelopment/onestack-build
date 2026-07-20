/**
 * Card 60.6 — run the retrieval gold set against whichever embedder is configured, and print the score.
 *
 *   npm run eval:retrieval
 *
 * Point of this script: the embedding provider is an open decision (card 60.3), and it should be settled
 * with a number. Configure a candidate embedder, run this, compare. It also gives a baseline to detect a
 * later regression — retrieval can rot without any test going red, because nothing here throws.
 *
 * Runs against a scratch tenant and deletes it afterwards, so it is safe to run against a real database.
 * Needs DATABASE_URL + APP_DATABASE_URL; exits cleanly with a message if they're absent.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EmbeddingIndexService } from '../src/ai/embedding-index.service';
import { EMBEDDING_DIMS, Embedder } from '../src/ai/embedder';
import { EvalCase, EvalResult, formatScore, scoreRetrieval } from '../src/ai/retrieval-eval';
import { GOLD_JOBS, GOLD_QUERIES } from '../src/ai/retrieval-gold-set';
import { SimilarJobsService } from '../src/ai/similar-jobs.service';
import { StubEmbedder } from '../src/ai/stub-embedder';
import { TenantService } from '../src/tenancy/tenant.service';

/** How far down the list a hit still counts — matches MAX_PRECEDENTS, what actually reaches the prompt. */
const K = 3;

/**
 * Swap this for a candidate provider to score it. Kept as one obvious line because comparing providers
 * is the whole point of the script.
 */
function embedderUnderTest(): Embedder {
  return new StubEmbedder();
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL || !process.env.APP_DATABASE_URL) {
    console.log('Skipping: DATABASE_URL and APP_DATABASE_URL must both be set.');
    return;
  }

  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const embedder = embedderUnderTest();
  const similar = new SimilarJobsService(new EmbeddingIndexService(new TenantService(), embedder));

  const tenant = await admin.tenant.create({ data: { name: `retrieval-eval-${randomUUID()}` } });
  const jobIdByGoldId = new Map<string, string>();

  try {
    // 1. Index the past jobs.
    for (const gold of GOLD_JOBS) {
      const job = await admin.workItem.create({
        data: {
          tenantId: tenant.id,
          type: 'job',
          stateName: 'booked',
          workflowVersion: 1,
          reference: `${gold.id}-${randomUUID().slice(0, 8)}`,
        },
      });
      jobIdByGoldId.set(gold.id, job.id);
      await similar.indexJob(tenant.id, job.id, { summary: gold.summary, items: [] });
    }

    // 2. Ask each question. Each query is a NEW job, so it needs a real row to be excluded from its
    //    own results — the same shape the live path uses.
    const cases: EvalCase[] = [];
    const results: EvalResult[] = [];

    for (const query of GOLD_QUERIES) {
      const queryJob = await admin.workItem.create({
        data: {
          tenantId: tenant.id,
          type: 'job',
          stateName: 'booked',
          workflowVersion: 1,
          reference: `query-${randomUUID().slice(0, 8)}`,
        },
      });

      const matches = await similar.findSimilarJobs(
        tenant.id,
        queryJob.id,
        { summary: query.summary, items: [] },
        K,
      );

      // Translate DB ids back to gold ids so the report is readable.
      const idToGold = new Map([...jobIdByGoldId].map(([goldId, jobId]) => [jobId, goldId]));
      cases.push({
        name: query.name,
        queryJobId: queryJob.id,
        expectedJobIds: query.expectedJobIds,
      });
      results.push({
        name: query.name,
        returnedJobIds: matches.map((m) => idToGold.get(m.workItemId) ?? m.workItemId),
      });
    }

    const score = scoreRetrieval(cases, results, K);
    console.log(
      `\n${formatScore(`embedder: ${embedder.name} (${EMBEDDING_DIMS} dims)`, score, K)}\n`,
    );

    if (embedder.name === 'stub') {
      console.log(
        'NOTE: the stub embedder has no semantic signal — it only matches identical text. A low score\n' +
          'here is expected and is the FLOOR a real provider must beat, not a bug.\n',
      );
    }
  } finally {
    await admin.$executeRawUnsafe(
      `DELETE FROM "onestack_job_embedding" WHERE "tenantId" = $1::uuid`,
      tenant.id,
    );
    await admin.workItem.deleteMany({ where: { tenantId: tenant.id } });
    await admin.tenant.deleteMany({ where: { id: tenant.id } });
    await admin.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
