import { describe, expect, it } from 'vitest';
import { estimateFlags, FlagInput } from './estimate-flags';

const item = (
  panel: string,
  operation: FlagInput['operation'],
  confidence?: number,
): FlagInput => ({
  panel,
  operation,
  confidence,
});

describe('estimateFlags', () => {
  it('escalates on structural damage and marks it critical', () => {
    const { flags, escalate } = estimateFlags([
      item('Front bumper', 'replace'),
      item('Right chassis rail', 'repair'),
    ]);
    expect(escalate).toBe(true);
    const structural = flags.find((f) => f.code === 'structural');
    expect(structural?.level).toBe('critical');
    expect(structural?.message).toMatch(/Right chassis rail/);
    expect(structural?.message).toMatch(/do not auto-approve/i);
  });

  it('flags low-confidence lines for review', () => {
    const { flags } = estimateFlags([
      item('Bonnet', 'paint', 0.4),
      item('Left door', 'repair', 0.9),
    ]);
    const low = flags.find((f) => f.code === 'low_confidence');
    expect(low?.level).toBe('warn');
    expect(low?.message).toMatch(/Bonnet/);
    expect(low?.message).not.toMatch(/Left door/); // 0.9 is confident
  });

  it('flags hidden-damage risk behind bumpers/guards as a supplementary', () => {
    const { flags } = estimateFlags([item('Front bumper', 'replace')]);
    const supp = flags.find((f) => f.code === 'supplementary');
    expect(supp?.level).toBe('info');
    expect(supp?.message).toMatch(/supplementary/i);
  });

  it('a clean, confident, non-structural scope raises nothing and does not escalate', () => {
    const { flags, escalate } = estimateFlags([
      item('Left door', 'repair', 0.95),
      item('Roof', 'paint', 0.9),
    ]);
    expect(flags).toEqual([]);
    expect(escalate).toBe(false);
  });

  it('missing confidence is not treated as low confidence', () => {
    const { flags } = estimateFlags([item('Left door', 'repair')]);
    expect(flags.find((f) => f.code === 'low_confidence')).toBeUndefined();
  });
});
