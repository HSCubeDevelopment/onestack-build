import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Unit tests for the web app's pure modules — any `*.test.ts` under `src`.
 *
 * `environment: 'node'` on purpose: what's tested here is logic, not rendering — there's no jsdom and
 * no component harness to keep alive. A test that needs a DOM should come with the decision to add
 * one, rather than arriving on the back of this config.
 */
export default defineConfig({
  resolve: {
    // Mirror the `@/*` -> `src/*` alias from tsconfig.json, so a test imports a module the same way
    // the app does.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.next/**'],
    retry: 0,
  },
});
