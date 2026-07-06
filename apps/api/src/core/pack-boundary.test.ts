import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Architecture rule (card #6.1): "packs don't modify core." A pack DEFINITION (`*.pack.ts`) may import
 * ONLY the pack contract (plus zod / @xstate) — never core services, the registry/engine internals,
 * tenancy, or Prisma. This test scans every pack definition's imports and fails if a pack reaches into
 * the core. (The PacksModule that INSTALLS packs is infrastructure, not a pack definition, so it is not
 * scanned — it is the sanctioned wiring point.)
 */
const SCAN_ROOTS = [
  join(__dirname, '..', '..', 'test', 'fixtures', 'packs'),
  join(__dirname, '..', 'packs'),
];

function isAllowed(source: string): boolean {
  if (source === 'zod') return true;
  if (source.startsWith('@xstate')) return true;
  // The one core module a pack may import is the public contract.
  if (source.replace(/\\/g, '/').endsWith('core/pack-contract')) return true;
  return false;
}

/** Recursively find every `*.pack.ts` (a pack definition) under the scan roots. */
function packFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.pack.ts')) out.push(p);
    }
  };
  SCAN_ROOTS.forEach(walk);
  return out;
}

describe('pack boundary', () => {
  it('exists at least one pack fixture to check', () => {
    expect(packFiles().length).toBeGreaterThan(0);
  });

  it('no pack imports core internals (only the pack contract + zod/@xstate)', () => {
    const violations: string[] = [];
    for (const file of packFiles()) {
      const src = readFileSync(file, 'utf8');
      const re = /(?:import|export)\s+[^'"]*from\s+['"]([^'"]+)['"]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        const source = m[1] as string;
        if (!isAllowed(source)) violations.push(`${file}: imports "${source}"`);
      }
    }
    expect(violations, violations.join('\n')).toHaveLength(0);
  });
});
