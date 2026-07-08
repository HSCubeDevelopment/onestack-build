import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AssistantAdapter } from './assistant-adapter';
import { AssistantService } from './assistant.service';
import { StubAssistantAdapter } from './stub-assistant-adapter';

// Fakes — no DB. runInTenant just runs the callback against a fake tx that records the created row.
function makeService(opts?: {
  adapter?: AssistantAdapter;
  workItemsGet?: (id: string) => Promise<unknown>;
  contactsGet?: (id: string) => Promise<unknown>;
}) {
  const created: Array<Record<string, unknown>> = [];
  const rows: Array<Record<string, unknown>> = [];
  const tx = {
    assistantMessage: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: 'msg-1', createdAt: new Date('2026-07-08T00:00:00Z'), ...data };
        created.push(data);
        rows.unshift(row);
        return row;
      },
      findMany: async () => rows,
    },
  };
  const tenants = { runInTenant: (_t: string, fn: (tx: unknown) => unknown) => fn(tx) };
  const workItems = { get: opts?.workItemsGet ?? (async () => ({ id: 'w' })) };
  const contacts = { get: opts?.contactsGet ?? (async () => ({ id: 'c' })) };
  const adapter = opts?.adapter ?? new StubAssistantAdapter();
  const service = new AssistantService(
    tenants as never,
    workItems as never,
    contacts as never,
    adapter,
  );
  return { service, created, rows };
}

describe('StubAssistantAdapter', () => {
  it('drafts a deterministic reply that references the question and defers to a human', async () => {
    const a = new StubAssistantAdapter();
    const r1 = await a.answer({ question: 'When will my car be ready?' });
    const r2 = await a.answer({ question: 'When will my car be ready?' });
    expect(r1.model).toBe('stub');
    expect(r1.answer).toContain('When will my car be ready?');
    expect(r1.answer).toContain('team member will confirm');
    expect(r2.answer).toBe(r1.answer); // deterministic
  });

  it('includes context when provided', async () => {
    const a = new StubAssistantAdapter();
    const r = await a.answer({ question: 'Status?', context: 'Job 123' });
    expect(r.answer).toContain('Job 123');
  });
});

describe('AssistantService.ask', () => {
  it('drafts, marks it a draft, and stores the message', async () => {
    const { service, created } = makeService();
    const view = await service.ask('t1', { question: 'How much for a bumper?' }, 'u1');
    expect(view.draft).toBe(true);
    expect(view.model).toBe('stub');
    expect(view.answer).toContain('How much for a bumper?');
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ tenantId: 't1', createdByUserId: 'u1', model: 'stub' });
  });

  it('rejects an empty question', async () => {
    const { service } = makeService();
    await expect(service.ask('t1', { question: '   ' }, 'u1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an over-long question', async () => {
    const { service } = makeService();
    const long = 'a'.repeat(2001);
    await expect(service.ask('t1', { question: long }, 'u1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('validates the job when workItemId is given (propagates a 404)', async () => {
    const { service } = makeService({
      workItemsGet: async () => {
        throw new Error('not found');
      },
    });
    await expect(
      service.ask('t1', { question: 'hi', workItemId: 'w1' }, 'u1'),
    ).rejects.toThrow('not found');
  });

  it('wraps an adapter failure as a 500 and does not store', async () => {
    const failing: AssistantAdapter = {
      name: 'boom',
      answer: async () => {
        throw new Error('provider down');
      },
    };
    const { service, created } = makeService({ adapter: failing });
    await expect(service.ask('t1', { question: 'hi' }, 'u1')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(created).toHaveLength(0);
  });
});

describe('AssistantService.list', () => {
  it('returns stored messages as draft views', async () => {
    const { service } = makeService();
    await service.ask('t1', { question: 'first' }, 'u1');
    const list = await service.list('t1');
    expect(list).toHaveLength(1);
    expect(list[0]?.draft).toBe(true);
  });
});
