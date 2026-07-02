/**
 * Foundation-only web config. Next.js + the real UI land in the walking-skeleton card (#4).
 * For now this just proves the web workspace typechecks in CI.
 */
export const webConfig = {
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001',
} as const;
