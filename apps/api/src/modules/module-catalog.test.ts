import { describe, expect, it } from 'vitest';
import { ModuleCatalog } from './module-catalog';

describe('ModuleCatalog', () => {
  const catalog = new ModuleCatalog(); // constructor validates the real catalogue (no cycles/unknowns)

  it('enabling a module pulls in its dependencies', () => {
    expect(catalog.resolveEnableSet(['scheduling']).sort()).toEqual(['contacts', 'scheduling']);
  });

  it('rejects an invalid combination (scheduling without contacts)', () => {
    expect(catalog.validateEnabledSet(['scheduling'])).toEqual([
      { node: 'scheduling', missing: ['contacts'] },
    ]);
  });

  it('accepts a complete combination', () => {
    expect(catalog.validateEnabledSet(['contacts', 'scheduling'])).toEqual([]);
  });

  it('orders dependencies first', () => {
    const order = catalog.order();
    expect(order.indexOf('contacts')).toBeLessThan(order.indexOf('scheduling'));
  });
});
