'use client';
import { useEffect, useState } from 'react';

export type Role = 'OWNER' | 'STAFF';

/**
 * The caller's role, from /api/me (which reads the session cookie server-side).
 *
 * For deciding what to RENDER and what to FETCH — not for security; the API denies an employee by
 * default regardless. Fetching matters as much as rendering: an owner-only request fired from a staff
 * page 403s, and if it sits in a Promise.all it rejects the whole page, not just its own panel.
 *
 * Returns undefined until resolved, so callers can wait rather than flashing the wrong surface.
 */
export function useRole(): { role: Role | undefined; isStaff: boolean } {
  const [role, setRole] = useState<Role | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    fetch('/api/me')
      .then((r) => r.json())
      .then((m: { role?: string }) => {
        if (alive) setRole(m.role === 'STAFF' ? 'STAFF' : 'OWNER');
      })
      // Fail closed: if we can't tell, assume the narrower surface rather than firing owner-only calls.
      .catch(() => alive && setRole('STAFF'));
    return () => {
      alive = false;
    };
  }, []);
  return { role, isStaff: role === 'STAFF' };
}
