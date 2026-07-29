import { describe, expect, it } from 'vitest';
import { isKnownModule, isToggleable, listModules, moduleDefault } from './module-registry';

describe('module registry', () => {
  it('knows registered modules and rejects unknown ones', () => {
    expect(isKnownModule('contacts')).toBe(true);
    expect(isKnownModule('scheduling')).toBe(true);
    expect(isKnownModule('vehicles')).toBe(true);
    expect(isKnownModule('tracking')).toBe(true);
    expect(isKnownModule('nope')).toBe(false);
  });

  it('exposes sensible defaults', () => {
    expect(moduleDefault('contacts')).toBe(true);
    expect(moduleDefault('scheduling')).toBe(false);
    // Pack features are opt-in: off until a tenant enables them.
    expect(moduleDefault('vehicles')).toBe(false);
  });

  it('marks core services as non-toggleable and pack features as toggleable', () => {
    expect(isToggleable('contacts')).toBe(false); // core, always on
    expect(isToggleable('vehicles')).toBe(true);
    expect(isToggleable('tracking')).toBe(true);
  });

  it('lists the full catalogue grouped as core + automotive', () => {
    const groups = new Set(listModules().map((m) => m.group));
    expect(groups.has('core')).toBe(true);
    expect(groups.has('automotive')).toBe(true);
    for (const m of listModules()) {
      expect(typeof m.key).toBe('string');
      expect(typeof m.label).toBe('string');
      expect(typeof m.toggleable).toBe('boolean');
    }
  });
});
