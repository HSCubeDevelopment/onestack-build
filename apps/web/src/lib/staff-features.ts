/**
 * Staff surfaces that are temporarily switched off.
 *
 * These hide the ENTRY POINTS only. Nothing is deleted: the pages, the API routes, the tables and any
 * rows already written all stay exactly as they are, so flipping a flag back to `false` restores the
 * feature with no migration and no data loss.
 *
 * Kept in one file on purpose. Each feature is reachable from several places — a home tile, deep links
 * on other screens, and a typed URL — so scattering `false &&` through components would guarantee one
 * gets missed and the feature stays half-visible.
 *
 * This is UX, not security. The API still serves both features to a valid STAFF token; an employee who
 * knows the URL is stopped by the middleware, not by the server. If a feature ever needs to be denied
 * rather than hidden, that belongs in the API's guards.
 */
export const HIDDEN_FROM_STAFF = {
  /** Instant estimate — the photo → AI parts & price draft flow (`/inout/estimate`). */
  instantEstimate: true,
  /** File a ticket — logging a police / infringement notice on a car (`/inout/ticket`). */
  fileTicket: true,
} as const;

/**
 * Paths an employee must not reach by typing a URL or following an old bookmark, derived from the flags
 * above so the two can never drift apart.
 */
export const STAFF_HIDDEN_PREFIXES: readonly string[] = [
  ...(HIDDEN_FROM_STAFF.instantEstimate ? ['/inout/estimate'] : []),
  ...(HIDDEN_FROM_STAFF.fileTicket ? ['/inout/ticket'] : []),
];
