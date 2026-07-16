import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { OnboardingService } from './onboarding.service';

function make(opts?: {
  existingContacts?: Array<{ phone: string | null }>;
  resources?: unknown[];
  page?: { exists: boolean; enabled: boolean };
  brandSet?: boolean;
  jobs?: unknown[];
}) {
  const created: Array<{ displayName: string; phone: string }> = [];
  const contacts = {
    list: async () => opts?.existingContacts ?? [],
    create: async (_t: string, input: { displayName: string; phone: string }) => {
      created.push(input);
      return { id: `c${created.length}` };
    },
  };
  const resources = { list: async () => opts?.resources ?? [] };
  const booking = { getConfig: async () => opts?.page ?? { exists: false, enabled: false } };
  const branding = { exists: async () => opts?.brandSet ?? false };
  const workItems = { list: async () => opts?.jobs ?? [] };
  const svc = new OnboardingService(
    contacts as never,
    resources as never,
    booking as never,
    branding as never,
    workItems as never,
  );
  return { svc, created };
}

describe('OnboardingService.importContacts', () => {
  it('dry-run previews without writing', async () => {
    const { svc, created } = make();
    const res = await svc.importContacts('t1', {
      csv: 'name,phone\nJane,0400000000\nSam,0411111111',
      dryRun: true,
    });
    expect(res.dryRun).toBe(true);
    expect(res.summary).toMatchObject({ total: 2, ok: 2 });
    expect(res.created).toBe(0);
    expect(created).toHaveLength(0);
  });

  it('creates the ok rows and skips duplicates on a real run', async () => {
    const { svc, created } = make({ existingContacts: [{ phone: '0411111111' }] });
    const res = await svc.importContacts('t1', {
      rows: [
        { name: 'Jane', phone: '0400000000' }, // ok
        { name: 'Sam', phone: '0411111111' }, // duplicate of on-file
        { name: 'NoPhone', phone: '' }, // error
      ],
    });
    expect(res.created).toBe(1);
    expect(created).toEqual([{ displayName: 'Jane', phone: '0400000000' }]);
    expect(res.summary).toEqual({ total: 3, ok: 1, duplicate: 1, error: 1 });
  });

  it('rejects an empty import and an over-cap import', async () => {
    const { svc } = make();
    await expect(svc.importContacts('t1', { rows: [] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const many = Array.from({ length: 1001 }, (_, i) => ({ name: `N${i}`, phone: `${i}` }));
    await expect(svc.importContacts('t1', { rows: many })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('OnboardingService.checklist', () => {
  it('reports which setup steps are done', async () => {
    const { svc } = make({
      existingContacts: [{ phone: '0400' }],
      resources: [{ id: 'r1' }],
      page: { exists: true, enabled: true },
      brandSet: true,
      jobs: [],
    });
    const list = await svc.checklist('t1');
    expect(list.total).toBe(5);
    expect(list.completed).toBe(4); // all but first_job
    expect(list.complete).toBe(false);
    expect(list.steps.find((s) => s.key === 'first_job')?.done).toBe(false);
    expect(list.steps.find((s) => s.key === 'brand')?.done).toBe(true);
  });

  it('is all-complete when every step is done', async () => {
    const { svc } = make({
      existingContacts: [{ phone: '0400' }],
      resources: [{ id: 'r1' }],
      page: { exists: true, enabled: true },
      brandSet: true,
      jobs: [{ id: 'j1' }],
    });
    expect((await svc.checklist('t1')).complete).toBe(true);
  });
});
