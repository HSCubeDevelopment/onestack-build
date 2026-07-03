import { describe, expect, it } from 'vitest';
import { isKnownModule, moduleDefault } from './module-registry';

describe('module registry', () => {
  it('knows registered modules and rejects unknown ones', () => {
    expect(isKnownModule('contacts')).toBe(true);
    expect(isKnownModule('scheduling')).toBe(true);
    expect(isKnownModule('nope')).toBe(false);
  });

  it('exposes sensible defaults', () => {
    expect(moduleDefault('contacts')).toBe(true);
    expect(moduleDefault('scheduling')).toBe(false);
  });
});
