import type { AuthContext } from './auth.types';

/**
 * Row-level scope for the employee (STAFF) role.
 *
 * `@AllowStaff()` only decides whether a worker may CALL a route; it says nothing about which rows come
 * back. For anything job-shaped, pass this into the service so a worker only ever receives jobs they are
 * assigned to. Returns undefined for OWNER, who sees the whole tenant.
 *
 * Keep this the single definition of "which jobs are mine" — duplicating the `role === 'STAFF'` check at
 * call sites is how one of them silently drifts open.
 */
// Fail safe: ONLY an OWNER is unscoped. Every non-owner role (STAFF, TOW) is narrowed to their own
// assigned jobs, so a new role is scoped by default rather than silently seeing the whole tenant.
export const assignedScopeFor = (user: AuthContext): string | undefined =>
  user.role === 'OWNER' ? undefined : user.userId;
