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
    setupFiles: ['./test/setup.ts'],
    testTimeout: 45_000,
    hookTimeout: 60_000, // cold Supabase direct-connection setup in beforeAll can be slow
    fileParallelism: false, // integration specs share tenant tables; run files serially
  },
});
