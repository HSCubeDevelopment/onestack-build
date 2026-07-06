/**
 * Destructive-migration CI guard (card #5.2). Prisma will happily emit DROP/RENAME; a non-coder can't
 * catch that in review. This scans migration SQL for destructive DDL and FAILS unless a human has added
 * the `approved-destructive-migration` label (surfaced to the script as APPROVED_DESTRUCTIVE=true).
 *
 * Run: npm run check:migrations
 * DROP POLICY / DROP INDEX / CREATE ... IF NOT EXISTS are NOT destructive to data and are ignored.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface DestructiveHit {
  file: string;
  line: number;
  text: string;
  rule: string;
}

const RULES: { rule: string; re: RegExp }[] = [
  { rule: 'DROP TABLE', re: /\bDROP\s+TABLE\b/i },
  { rule: 'DROP COLUMN', re: /\bDROP\s+COLUMN\b/i },
  { rule: 'DROP SCHEMA', re: /\bDROP\s+SCHEMA\b/i },
  { rule: 'DROP DATABASE', re: /\bDROP\s+DATABASE\b/i },
  { rule: 'TRUNCATE', re: /\bTRUNCATE\b/i },
  { rule: 'RENAME', re: /\bRENAME\s+(TO|COLUMN|CONSTRAINT)\b/i },
  { rule: 'ALTER…DROP CONSTRAINT', re: /\bALTER\s+TABLE\b.*\bDROP\s+CONSTRAINT\b/i },
];

/** Scan one SQL string. Comment lines (`--`) are ignored. */
export function scanSql(sql: string, file: string): DestructiveHit[] {
  const hits: DestructiveHit[] = [];
  sql.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (line.startsWith('--') || line === '') return;
    for (const { rule, re } of RULES) {
      if (re.test(line)) hits.push({ file, line: i + 1, text: line, rule });
    }
  });
  return hits;
}

function sqlFilesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      // Rollback scripts (*_down.sql) are destructive by design (that's what a rollback IS) and run only
      // on an explicit rollback — the guard is about FORWARD migrations silently dropping data.
      else if (name.endsWith('.sql') && !name.endsWith('_down.sql')) out.push(p);
    }
  };
  walk(dir);
  return out;
}

export function findDestructiveMigrations(root: string): DestructiveHit[] {
  return sqlFilesUnder(root).flatMap((f) => scanSql(readFileSync(f, 'utf8'), f));
}

function main(): void {
  const root = join(__dirname, '..', 'prisma', 'sql');
  const hits = findDestructiveMigrations(root);
  if (hits.length === 0) {
    // eslint-disable-next-line no-console
    console.log('✅ No destructive migration statements found.');
    return;
  }
  const approved = process.env.APPROVED_DESTRUCTIVE === 'true';
  // eslint-disable-next-line no-console
  console.error(`⚠️  Destructive migration statements found (${hits.length}):`);
  for (const h of hits) {
    // eslint-disable-next-line no-console
    console.error(`   ${h.file}:${h.line}  [${h.rule}]  ${h.text}`);
  }
  if (approved) {
    // eslint-disable-next-line no-console
    console.log('\n✅ Allowed: PR carries the `approved-destructive-migration` label.');
    return;
  }
  // eslint-disable-next-line no-console
  console.error(
    '\n❌ Blocked. A human must add the `approved-destructive-migration` label to this PR to proceed.',
  );
  process.exit(1);
}

if (require.main === module) main();
