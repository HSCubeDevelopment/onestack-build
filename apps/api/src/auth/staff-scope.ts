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
export const assignedScopeFor = (user: AuthContext): string | undefined =>
  user.role === 'STAFF' ? user.userId : undefined;
