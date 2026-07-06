// Cards #9 (event bus), #9.15 (outbox/idempotency/DLQ), #9.05 (background-job tenant wrapper).
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConsumerRegistry } from '../src/eventing/consumer-registry';
import { EventBus } from '../src/eventing/event-bus';
import { OutboxRelay } from '../src/eventing/outbox-relay.service';
import { OutboxService } from '../src/eventing/outbox.service';
import { BackgroundJobRunner } from '../src/jobs/job-runner';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantService } from '../src/tenancy/tenant.service';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('eventing: outbox + idempotency + DLQ + job tenancy', () => {
  let admin: PrismaClient;
  let prisma: PrismaService;
  let tenants: TenantService;
  let outbox: OutboxService;
  let registry: ConsumerRegistry;
  let bus: EventBus;
  let jobs: BackgroundJobRunner;
  let relay: OutboxRelay;
  let a: TestTenant;
  let b: TestTenant;

  beforeAll(async () => {
    admin = adminPrisma();
    prisma = new PrismaService();
    tenants = new TenantService();
    outbox = new OutboxService(prisma);
    registry = new ConsumerRegistry();
    bus = new EventBus(outbox, registry);
    jobs = new BackgroundJobRunner(tenants);
    relay = new OutboxRelay(outbox, registry, jobs);
    a = await makeTenant(admin, 'Evt A');
    b = await makeTenant(admin, 'Evt B');
    // Clean slate: the relay scans ALL tenants, so any events left by a crashed prior run would leak in.
    await admin.$executeRawUnsafe(`DELETE FROM "onestack_inbox_consumed"`);
    await admin.$executeRawUnsafe(`DELETE FROM "onestack_outbox_event"`);
  });

  afterAll(async () => {
    for (const t of [a.tenantId, b.tenantId]) {
      await admin.$executeRawUnsafe(
        `DELETE FROM "onestack_inbox_consumed" WHERE "tenantId" = $1::uuid`,
        t,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM "onestack_outbox_event" WHERE "tenantId" = $1::uuid`,
        t,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM "onestack_contact" WHERE "tenantId" = $1::uuid`,
        t,
      );
    }
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await prisma.$disconnect();
    await admin.$disconnect();
  });

  it('delivers durably (no loss after commit) and is idempotent on duplicate delivery', async () => {
    const seen: string[] = [];
    bus.subscribe({
      name: 'test.counter',
      type: 'thing.happened',
      handle: async (_tx, e) => {
        seen.push(e.id);
      },
    });

    // Simulate a state change that commits the event to the outbox, then a crash BEFORE publishing.
    let eventId = '';
    await tenants.runInTenant(a.tenantId, async (tx) => {
      eventId = await bus.publish(tx, {
        tenantId: a.tenantId,
        type: 'thing.happened',
        payload: { n: 1 },
      });
    });

    // Relay picks it up after the "crash" → not lost. (Assert on OUR event id — the relay scans all
    // tenants, so we don't assume the array contains only this event.)
    await relay.pollOnce();
    expect(seen.filter((id) => id === eventId)).toEqual([eventId]);

    // Re-deliver the SAME event → the inbox makes it a no-op.
    await prisma.outboxEvent.update({
      where: { id: eventId },
      data: { status: 'pending', nextAttemptAt: new Date(0) },
    });
    await relay.pollOnce();
    expect(seen.filter((id) => id === eventId)).toEqual([eventId]); // still exactly once
  });

  it('retries with backoff then dead-letters after the cap', async () => {
    let calls = 0;
    bus.subscribe({
      name: 'test.flaky',
      type: 'flaky.event',
      handle: async () => {
        calls++;
        throw new Error('boom');
      },
    });

    let eventId = '';
    await tenants.runInTenant(a.tenantId, async (tx) => {
      eventId = await bus.publish(tx, { tenantId: a.tenantId, type: 'flaky.event', payload: {} });
    });

    // Advance the clock each poll so the backoff never blocks the next attempt.
    const base = Date.now();
    for (let i = 0; i < 6; i++) {
      await relay.pollOnce(50, () => new Date(base + i * 3_600_000));
    }

    const row = await prisma.outboxEvent.findUnique({ where: { id: eventId } });
    expect(row?.status).toBe('dead'); // in the DLQ
    expect(calls).toBe(5); // MAX_ATTEMPTS
  });

  it('runs consumers/jobs in tenant context — A cannot read or write B (card #9.05)', async () => {
    await jobs.run({ tenantId: a.tenantId }, (tx) =>
      tx.contact.create({ data: { tenantId: a.tenantId, displayName: 'A job contact' } }),
    );

    const seenByB = await jobs.run({ tenantId: b.tenantId }, (tx) => tx.contact.findMany());
    expect(seenByB.find((c) => c.displayName === 'A job contact')).toBeUndefined();

    // A job for B cannot write a row stamped with A's tenantId (WITH CHECK).
    await expect(
      jobs.run({ tenantId: b.tenantId }, (tx) =>
        tx.contact.create({ data: { tenantId: a.tenantId, displayName: 'smuggled' } }),
      ),
    ).rejects.toThrow();

    // A job with no tenant is refused outright.
    await expect(jobs.run({ tenantId: '' }, async () => 1)).rejects.toThrow();
  });
});
