import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Unit tests for the web app's server-side logic.
 *
 * The web workspace had no test runner, so `npm test` at the root skipped it entirely — which is how
 * an ungated `mintDevToken` (an OWNER token for any anonymous caller) sat in the proxy with nothing
 * asserting otherwise. Deliberately node-only and narrow: this covers lib/ logic, not React rendering.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // A Next.js build-time marker with no runtime behaviour; it has no resolvable module here.
      'server-only': fileURLToPath(new URL('./test/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.next/**'],
    retry: 0,
  },
});
