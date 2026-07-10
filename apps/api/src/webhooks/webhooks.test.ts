import { describe, expect, it } from 'vitest';
import { signPayload, subscribes } from './webhooks';

describe('signPayload', () => {
  it('is deterministic and depends on secret + body', () => {
    const a = signPayload('s1', '{"x":1}');
    expect(a).toBe(signPayload('s1', '{"x":1}'));
    expect(a).not.toBe(signPayload('s2', '{"x":1}'));
    expect(a).not.toBe(signPayload('s1', '{"x":2}'));
    expect(a).toMatch(/^[a-f0-9]{64}$/); // hex sha256
  });
});

describe('subscribes', () => {
  it('matches "*" and exact event types', () => {
    expect(subscribes(['*'], 'job.created')).toBe(true);
    expect(subscribes(['job.created'], 'job.created')).toBe(true);
    expect(subscribes(['job.created'], 'invoice.paid')).toBe(false);
    expect(subscribes('nope', 'x')).toBe(false);
  });
});
