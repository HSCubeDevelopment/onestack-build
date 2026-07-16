import { SetMetadata } from '@nestjs/common';
import type { AppRole } from './auth.types';

export const ROLES_KEY = 'roles';

/**
 * Restrict a route to the given roles.
 *
 * NOTE the default: a route guarded by RolesGuard with NO decorator is OWNER-only — STAFF (the employee
 * role) is denied unless a route explicitly opts them in via `AllowStaff`. This is deliberate. A
 * controller added later is closed to employees until someone makes a decision, rather than silently
 * exposing the business's revenue, pricing and customer data. Fail closed, not open.
 */
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Opt a route into the employee (STAFF) surface. Use ONLY for what a worker on the floor needs: their
 * own time clock, their own assigned jobs, parts requests, the roster.
 *
 * Anything that exposes the BUSINESS rather than the worker's own work — revenue, the full job board,
 * other customers, pricing, POS, integrations — stays OWNER-only (i.e. no decorator).
 *
 * Opting a route in is necessary but rarely sufficient: routes that return per-job data must ALSO scope
 * their query to the caller's assigned jobs. The guard answers "may they call this?", not "whose rows?".
 */
export const AllowStaff = () => Roles('OWNER', 'STAFF');
