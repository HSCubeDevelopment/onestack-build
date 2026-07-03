/**
 * Coverage ratchet (card #5.1): coverage can only go UP. Reads the vitest json-summary and compares
 * each metric to a committed baseline; fails if any metric drops. Because the AI writes both code and
 * its own tests, a ratchet is what actually stops silent test-deletion / coverage erosion.
 *
 *   npm run test:cov            # produce coverage/coverage-summary.json
 *   npm run coverage:ratchet    # fail if below baseline
 *   npm run coverage:ratchet -- --update   # raise the baseline after a genuine increase
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type Metric = 'lines' | 'statements' | 'functions' | 'branches';
const METRICS: Metric[] = ['lines', 'statements', 'functions', 'branches'];
const EPSILON = 0.01; // ignore floating-point noise

const summaryPath = join(__dirname, '..', 'coverage', 'coverage-summary.json');
const baselinePath = join(__dirname, '..', 'coverage', 'baseline.json');

function main(): void {
  if (!existsSync(summaryPath)) {
    // eslint-disable-next-line no-console
    console.error(`No coverage summary at ${summaryPath}. Run "npm run test:cov" first.`);
    process.exit(2);
  }
  const total = JSON.parse(readFileSync(summaryPath, 'utf8')).total as Record<
    Metric,
    { pct: number }
  >;
  const current = Object.fromEntries(METRICS.map((m) => [m, total[m].pct])) as Record<
    Metric,
    number
  >;
  const baseline: Record<Metric, number> = existsSync(baselinePath)
    ? JSON.parse(readFileSync(baselinePath, 'utf8'))
    : { lines: 0, statements: 0, functions: 0, branches: 0 };

  if (process.argv.includes('--update')) {
    const raised = Object.fromEntries(
      METRICS.map((m) => [m, Math.max(current[m], baseline[m])]),
    ) as Record<Metric, number>;
    writeFileSync(baselinePath, JSON.stringify(raised, null, 2) + '\n');
    // eslint-disable-next-line no-console
    console.log('Baseline updated →', raised);
    return;
  }

  const drops = METRICS.filter((m) => current[m] < baseline[m] - EPSILON);
  // eslint-disable-next-line no-console
  console.log(
    'coverage:',
    METRICS.map((m) => `${m} ${current[m].toFixed(2)}% (base ${baseline[m]}%)`).join(', '),
  );
  if (drops.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      `❌ coverage dropped: ${drops.map((m) => `${m} ${current[m]}% < ${baseline[m]}%`).join(', ')}`,
    );
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log('✅ coverage ratchet holds (no metric below baseline).');
}

main();
