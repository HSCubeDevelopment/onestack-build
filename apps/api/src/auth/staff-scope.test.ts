// The employee row-scope rule. Tiny, but it's the difference between a worker seeing their own jobs and
// seeing the whole workshop's — so it gets its own test rather than riding on a controller's.
import { describe, expect, it } from 'vitest';
import type { AuthContext } from './auth.types';
import { assignedScopeFor } from './staff-scope';

const user = (role: AuthContext['role'], userId = 'user-1'): AuthContext => ({
  userId,
  tenantId: 'tenant-1',
  role,
});

describe('assignedScopeFor', () => {
  it('scopes STAFF to their own user id', () => {
    expect(assignedScopeFor(user('STAFF', 'worker-9'))).toBe('worker-9');
  });

  it('does not scope OWNER — they see the whole tenant', () => {
    expect(assignedScopeFor(user('OWNER'))).toBeUndefined();
  });

  it('scopes a TOW driver to their own jobs, like any non-owner (301, fail-safe)', () => {
    expect(assignedScopeFor(user('TOW', 'tow-7'))).toBe('tow-7');
  });

  it('returns the id itself, so a caller cannot accidentally pass a truthy non-id', () => {
    // Guards against a refactor that returns `true`/`'me'` and silently matches nothing (or everything).
    const scope = assignedScopeFor(user('STAFF', 'abc'));
    expect(typeof scope).toBe('string');
    expect(scope).not.toBe('me');
  });
});
