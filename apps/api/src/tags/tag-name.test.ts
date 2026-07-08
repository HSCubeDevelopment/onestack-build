// Unit tests for the pure tag-name logic (Phase 3 — segmentation & tagging). No DB.
import { describe, expect, it } from 'vitest';
import { normaliseTagName, sameTagName } from './tag-name';

const fail = (m: string) => new Error(m);

describe('normaliseTagName', () => {
  it('trims a valid name', () => {
    expect(normaliseTagName('  Fleet  ', fail)).toBe('Fleet');
  });

  it('rejects an empty name', () => {
    expect(() => normaliseTagName('   ', fail)).toThrow(/required/i);
    expect(() => normaliseTagName('', fail)).toThrow(/required/i);
  });

  it('rejects an over-long name', () => {
    expect(() => normaliseTagName('x'.repeat(61), fail)).toThrow(/60 characters/i);
  });
});

describe('sameTagName', () => {
  it('compares case-insensitively and trims', () => {
    expect(sameTagName('Fleet', '  fleet ')).toBe(true);
    expect(sameTagName('Fleet', 'VIP')).toBe(false);
  });
});
