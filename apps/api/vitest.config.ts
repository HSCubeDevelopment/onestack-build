import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Unit tests: src/**/*.test.ts (no DB, always run in CI).
    // Integration tests: test/**/*.int.spec.ts (need a Supabase DB; skipIf(!hasDb)).
    include: ['src/**/*.test.ts', 'test/**/*.spec.ts'],
    setupFiles: ['./test/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false, // integration specs share tenant tables; run files serially
  },
});
