import { expect, test } from '@playwright/test';
import * as jwt from 'jsonwebtoken';

/**
 * Walking-skeleton golden flow (card #4): authenticate → create one contact → see it.
 * Needs a live API + a tenant that exists in its DB:
 *   E2E_BASE_URL         the API base (e.g. https://onestack-api-staging.fly.dev)
 *   SUPABASE_JWT_SECRET  to mint a token the API will accept
 *   E2E_TENANT_ID        a provisioned tenant id
 *   E2E_USER_ID          a user id with STAFF membership in that tenant
 */
const ready = Boolean(
  process.env.E2E_BASE_URL &&
  process.env.SUPABASE_JWT_SECRET &&
  process.env.E2E_TENANT_ID &&
  process.env.E2E_USER_ID,
);

test.skip(
  !ready,
  'E2E env not configured (E2E_BASE_URL / SUPABASE_JWT_SECRET / E2E_TENANT_ID / E2E_USER_ID)',
);

test('login → create contact → see it', async ({ request }) => {
  const token = jwt.sign(
    { sub: process.env.E2E_USER_ID, tenant_id: process.env.E2E_TENANT_ID, role: 'STAFF' },
    process.env.SUPABASE_JWT_SECRET as string,
    { expiresIn: '10m' },
  );
  const auth = { Authorization: `Bearer ${token}` };
  const name = `E2E Contact ${Date.now()}`;

  const created = await request.post('/api/v1/contacts', {
    headers: auth,
    data: { displayName: name, phone: '0400000000' },
  });
  expect(created.ok()).toBeTruthy();

  const list = await request.get('/api/v1/contacts', { headers: auth });
  expect(list.ok()).toBeTruthy();
  const body = (await list.json()) as { displayName: string }[];
  expect(body.some((c) => c.displayName === name)).toBeTruthy();
});
