import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findDestructiveMigrations, scanSql } from '../../scripts/check-destructive-migrations';

describe('destructive-migration guard', () => {
  it('flags DROP TABLE / DROP COLUMN / RENAME / TRUNCATE', () => {
    const sql = `
      DROP TABLE "onestack_contact";
      ALTER TABLE "x" DROP COLUMN "y";
      ALTER TABLE "x" RENAME COLUMN "a" TO "b";
      TRUNCATE "z";
    `;
    const hits = scanSql(sql, 'x.sql').map((h) => h.rule);
    expect(hits).toContain('DROP TABLE');
    expect(hits).toContain('DROP COLUMN');
    expect(hits).toContain('RENAME');
    expect(hits).toContain('TRUNCATE');
  });

  it('does NOT flag safe DDL or comments', () => {
    const sql = `
      -- DROP TABLE this is only a comment
      CREATE TABLE IF NOT EXISTS "t" ("id" uuid);
      DROP POLICY IF EXISTS "p" ON "t";
      CREATE INDEX IF NOT EXISTS "i" ON "t" ("id");
      ALTER TABLE "t" ENABLE ROW LEVEL SECURITY;
    `;
    expect(scanSql(sql, 'x.sql')).toHaveLength(0);
  });

  it('the real migration SQL is non-destructive (baseline stays green)', () => {
    // The committed forward migrations must not contain destructive DDL.
    const root = join(__dirname, '..', '..', 'prisma', 'sql');
    const hits = findDestructiveMigrations(root).filter((h) => !h.file.endsWith('_down.sql'));
    expect(hits, JSON.stringify(hits, null, 2)).toHaveLength(0);
  });
});
