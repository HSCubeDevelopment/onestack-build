import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // SWC transform emits `emitDecoratorMetadata`, which esbuild (vitest's default) does not.
  // Without it, NestJS DI can't resolve constructor param types in the in-process app boot.
  plugins: [
    swc.vite({
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    // Unit tests: src/**/*.test.ts (no DB, always run in CI).
    // Integration tests: test/**/*.int.spec.ts (need a Supabase DB; skipIf(!hasDb)).
    include: ['src/**/*.test.ts', 'test/**/*.spec.ts'],
    // Flaky quarantine (card #5.1): *.quarantine.test.ts are NOT part of the gating run. Investigate,
    // don't blanket-retry. `retry: 0` makes flakiness fail loudly instead of being papered over.
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.quarantine.*'],
    retry: 0,
    setupFiles: ['./test/setup.ts'],
    testTimeout: 45_000,
    // Integration beforeAll/afterAll do multi-step setup + multi-table cleanup over the Supabase pooler,
    // which can be slow under load. Generous so real work isn't cut off; a genuinely hung hook still fails.
    hookTimeout: 180_000,
    fileParallelism: false, // integration specs share tenant tables; run files serially
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/main.ts', 'src/**/*.module.ts'],
    },
  },
});
