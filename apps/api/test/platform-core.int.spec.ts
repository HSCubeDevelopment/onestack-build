// Cards #6.1/#6.3/#6.4/#6.5 end-to-end against Supabase: one engine, two verticals, guards, version
// pinning, optimistic locking, pack-typed subjects, and tenant isolation.
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PackRegistry } from '../src/core/pack-registry';
import { CustomFieldService } from '../src/custom-fields/custom-field.service';
import { WorkflowEngine } from '../src/core/workflow.engine';
import { SubjectService } from '../src/subjects/subject.service';
import { TenantService } from '../src/tenancy/tenant.service';
import { WorkItemService } from '../src/work-items/work-item.service';
import { automotivePack } from './fixtures/packs/automotive.pack';
import { physioPack } from './fixtures/packs/physio.pack';
import { tradesPack } from './fixtures/packs/trades.pack';
import { adminPrisma, dropTenant, hasDb, makeTenant, TestTenant } from './helpers/harness';

describe.skipIf(!hasDb)('platform core (work item + subject + workflow)', () => {
  let admin: PrismaClient;
  let tenants: TenantService;
  let registry: PackRegistry;
  let workItems: WorkItemService;
  let subjects: SubjectService;
  let emitter: EventEmitter2;
  let a: TestTenant;
  let b: TestTenant;

  beforeAll(async () => {
    admin = adminPrisma();
    tenants = new TenantService();
    registry = new PackRegistry();
    registry.register(automotivePack);
    registry.register(physioPack);
    registry.register(tradesPack);
    emitter = new EventEmitter2();
    workItems = new WorkItemService(tenants, registry, new WorkflowEngine(registry), emitter);
    subjects = new SubjectService(tenants, registry, new CustomFieldService(tenants));
    a = await makeTenant(admin, 'Core A');
    b = await makeTenant(admin, 'Core B');
  });

  afterAll(async () => {
    for (const t of [a.tenantId, b.tenantId]) {
      await admin.$executeRawUnsafe(
        `DELETE FROM "onestack_work_item_subject" WHERE "tenantId" = $1::uuid`,
        t,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM "onestack_work_item" WHERE "tenantId" = $1::uuid`,
        t,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM "onestack_subject" WHERE "tenantId" = $1::uuid`,
        t,
      );
      await admin.$executeRawUnsafe(
        `DELETE FROM "onestack_work_item_counter" WHERE "tenantId" = $1::uuid`,
        t,
      );
    }
    await dropTenant(admin, a.tenantId);
    await dropTenant(admin, b.tenantId);
    await admin.$disconnect();
  });

  it('creates a work item with a per-tenant sequential reference', async () => {
    const one = await workItems.create(a.tenantId, { type: 'job', assignees: ['u1'] });
    const two = await workItems.create(a.tenantId, { type: 'job' });
    expect(one.reference).toMatch(/^WI-\d{6}$/);
    expect(one.stateName).toBe('Booked');
    expect(Number(two.reference.slice(3))).toBe(Number(one.reference.slice(3)) + 1);
  });

  it('runs two different verticals on the SAME engine via config only', async () => {
    const job = await workItems.create(a.tenantId, { type: 'job' });
    const appt = await workItems.create(a.tenantId, { type: 'appointment' });
    expect(job.stateName).toBe('Booked');
    expect(appt.stateName).toBe('Scheduled');
  });

  it('rejects an unknown type and invalid fields', async () => {
    await expect(workItems.create(a.tenantId, { type: 'spaceship' })).rejects.toThrow();
    await expect(
      subjects.create(a.tenantId, {
        type: 'vehicle',
        label: 'bad',
        fields: { rego: 'X', make: 'M', model: 'Z', year: 'not-a-number' },
      }),
    ).rejects.toThrow();
  });

  it('changes state ONLY via transitions; illegal transitions are rejected', async () => {
    const job = await workItems.create(a.tenantId, { type: 'job' });
    const started = await workItems.transition(a.tenantId, job.id, 'START');
    expect(started.stateName).toBe('InProgress');
    // COLLECT is only legal from Ready → rejected here.
    await expect(workItems.transition(a.tenantId, job.id, 'COLLECT')).rejects.toThrow();
  });

  it('enforces guards and fires side-effect actions as events', async () => {
    const fired: unknown[] = [];
    emitter.on('workflow.action', (e) => fired.push(e));

    let job = await workItems.create(a.tenantId, { type: 'job' });
    job = await workItems.transition(a.tenantId, job.id, 'START');
    job = await workItems.transition(a.tenantId, job.id, 'READY');
    // Guard isPaid=false → blocked.
    await expect(workItems.transition(a.tenantId, job.id, 'COLLECT')).rejects.toThrow();
    // Pay, then collect → action event fires.
    await workItems.update(a.tenantId, job.id, {
      fields: { paid: true },
      expectedVersion: job.version,
    });
    const collected = await workItems.transition(a.tenantId, job.id, 'COLLECT');
    expect(collected.stateName).toBe('Collected');
    expect(fired.some((e) => (e as { action: string }).action === 'notifyCollected')).toBe(true);
  });

  it('optimistic locking rejects a stale write', async () => {
    const job = await workItems.create(a.tenantId, { type: 'job' });
    await workItems.update(a.tenantId, job.id, { assignees: ['x'], expectedVersion: job.version });
    // Reusing the old version now conflicts.
    await expect(
      workItems.update(a.tenantId, job.id, { assignees: ['y'], expectedVersion: job.version }),
    ).rejects.toThrow();
  });

  it('pins in-flight items to their workflow version (a pack update does not strand them)', async () => {
    const job = await workItems.create(a.tenantId, { type: 'job' }); // pinned to v1
    // Ship v2 that no longer has START.
    registry.addWorkflowVersion({
      workItemType: 'job',
      version: 2,
      initial: 'Booked',
      states: { Booked: { on: { CANCEL: { target: 'Cancelled' } } }, Cancelled: { final: true } },
    });
    // The item still transitions per v1.
    const started = await workItems.transition(a.tenantId, job.id, 'START');
    expect(started.stateName).toBe('InProgress');
  });

  it('defines two Subject types from config (vehicle + property) and links to a work item', async () => {
    const vehicle = await subjects.create(a.tenantId, {
      type: 'vehicle',
      label: 'Ute',
      fields: { rego: 'ABC123', make: 'Toyota', model: 'Hilux', year: 2021 },
    });
    const property = await subjects.create(a.tenantId, {
      type: 'property',
      label: '12 Smith St',
      fields: { address: '12 Smith St', propertyType: 'residential' },
    });
    expect(vehicle.type).toBe('vehicle');
    expect(property.type).toBe('property');

    const job = await workItems.create(a.tenantId, { type: 'job', subjectIds: [vehicle.id] });
    expect(job.id).toBeTruthy();
  });

  it('isolates work items and subjects between tenants', async () => {
    const job = await workItems.create(a.tenantId, { type: 'job' });
    // Tenant B cannot read tenant A's work item (RLS → not found).
    await expect(workItems.get(b.tenantId, job.id)).rejects.toThrow();

    const vehicle = await subjects.create(a.tenantId, {
      type: 'vehicle',
      label: 'A-only',
      fields: { rego: 'AONLY', make: 'M', model: 'X', year: 2020 },
    });
    await expect(subjects.get(b.tenantId, vehicle.id)).rejects.toThrow();
  });
});
