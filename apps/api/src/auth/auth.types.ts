export type AppRole = 'OWNER' | 'STAFF' | 'TOW';

/** Resolved from a verified Supabase JWT and attached to the request. */
export interface AuthContext {
  userId: string; // JWT `sub` — the Supabase auth user id
  tenantId: string; // JWT custom claim `tenant_id` (set by the access-token hook)
  role: AppRole; // JWT custom claim `role`
}

// Express request augmentation.
declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}
