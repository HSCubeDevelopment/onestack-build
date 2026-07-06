/**
 * Migration up→down→up + post-migration isolation re-run (card #5.1).
 * Proves rollbacks are real and that RLS/isolation survives a full migration cycle.
 *
 * DESTRUCTIVE: it drops and recreates the core tables. It refuses to run unless
 * ALLOW_DESTRUCTIVE_ROUNDTRIP=true, so it can never nuke a real database by accident. Intended for a
 * DEDICATED test database in CI — never point it at production/staging data.
 *
 * Run: ALLOW_DESTRUCTIVE_ROUNDTRIP=true npm run migrate:roundtrip
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { findRlsViolations } from './check-rls';

const SQL = join(__dirname, '..', 'prisma', 'sql');

function apply(file: string): void {
  execFileSync(
    'npx',
    [
      'prisma',
      'db',
      'execute',
      '--file',
      join(SQL, file),
      '--schema',
      join(__dirname, '..', 'prisma', 'schema.prisma'),
    ],
    { stdio: 'inherit' },
  );
}

async function main(): Promise<void> {
  if (process.env.ALLOW_DESTRUCTIVE_ROUNDTRIP !== 'true') {
    // eslint-disable-next-line no-console
    console.error(
      'Refusing to run: set ALLOW_DESTRUCTIVE_ROUNDTRIP=true (dedicated test DB only).',
    );
    process.exit(2);
  }
  // eslint-disable-next-line no-console
  const log = (m: string) => console.log(`[roundtrip] ${m}`);

  log('up   → 0001_init, 0002_rls');
  apply('0001_init.sql');
  apply('0002_rls.sql');

  log('down → 0002_down, 0001_down');
  apply('0002_down.sql');
  apply('0001_down.sql');

  log('up   → 0001_init, 0002_rls (again)');
  apply('0001_init.sql');
  apply('0002_rls.sql');

  log('verify → RLS still forced on every tenant table');
  const prisma = new PrismaClient();
  try {
    const violations = await findRlsViolations(prisma);
    if (violations.length > 0) {
      // eslint-disable-next-line no-console
      console.error('❌ isolation broken after roundtrip:', violations);
      process.exit(1);
    }
    log('✅ up→down→up complete; RLS/isolation intact.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) void main();
