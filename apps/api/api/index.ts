import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * The OneStack API as a Vercel serverless function.
 *
 * WHY IT IMPORTS FROM `dist/` AND NOT `src/`. Vercel bundles functions with esbuild, which does not
 * emit `emitDecoratorMetadata` — and without that metadata NestJS cannot resolve constructor
 * parameter types, so every injected service arrives undefined and the app dies at boot. (The repo
 * already hits this: apps/api/vitest.config.ts uses SWC for the same reason.) `vercel.json` runs
 * `tsc` first, so what is imported here is already-compiled JavaScript with the metadata intact and
 * esbuild only ever sees this file.
 *
 * The Nest app is built ONCE per warm instance. A cold start pays for the DI container and the
 * Prisma client; every request after that on the same instance reuses them. The promise itself is
 * cached rather than the resolved app, so concurrent requests during a cold start wait on one boot
 * instead of racing to build several.
 */

type ExpressLike = (req: IncomingMessage, res: ServerResponse) => void;

let cached: Promise<ExpressLike> | null = null;

async function instance(): Promise<ExpressLike> {
  if (!cached) {
    cached = (async () => {
      // Resolved at runtime from the compiled output — see the note above.
      const { createApp } = (await import('../dist/main.js')) as {
        createApp: () => Promise<{
          init: () => Promise<unknown>;
          getHttpAdapter: () => { getInstance: () => ExpressLike };
        }>;
      };
      const app = await createApp();
      // init(), never listen(): Vercel owns the socket and hands us req/res directly.
      await app.init();
      return app.getHttpAdapter().getInstance();
    })().catch((err) => {
      // A failed boot must not be cached, or one bad cold start poisons the instance for its lifetime
      // and every later request fails with the same stale error.
      cached = null;
      throw err;
    });
  }
  return cached;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const express = await instance();
  express(req, res);
}
