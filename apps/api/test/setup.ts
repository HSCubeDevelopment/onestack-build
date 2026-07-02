// Vitest global setup for the API. Loads apps/api/.env if present, and guarantees a JWT secret so
// token signing works even without a full env (the DB env is what gates the integration tests).
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../.env') });

if (!process.env.SUPABASE_JWT_SECRET) {
  process.env.SUPABASE_JWT_SECRET = 'test-secret';
}
