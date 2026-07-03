import { SetMetadata } from '@nestjs/common';
import type { AppRole } from './auth.types';

export const ROLES_KEY = 'roles';

/** Restrict a route to the given roles. No decorator = any authenticated user. */
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);
