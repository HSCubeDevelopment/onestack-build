import { defineConfig } from '@playwright/test';

/**
 * Golden-flow E2E (API-level — no browser needed). This is the human-watchable oracle: its trace is
 * attached to the PR so Sidh can watch the walking skeleton run without reading code.
 * Runs against a live API (local `npm run start:dev`, or staging). Skips cleanly if E2E_BASE_URL unset.
 */
export default defineConfig({
  testDir: './e2e',
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3001',
    trace: 'on',
  },
});
