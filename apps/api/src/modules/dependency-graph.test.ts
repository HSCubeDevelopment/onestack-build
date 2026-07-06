import { describe, expect, it } from 'vitest';
import { DependencyGraph } from './dependency-graph';

// a → b, c ; b → d ; c → d  (a diamond)
const diamond = () => DependencyGraph.from({ a: ['b', 'c'], b: ['d'], c: ['d'], d: [] });

describe('DependencyGraph.validate', () => {
  it('accepts a valid acyclic graph', () => {
    expect(() => diamond().validate()).not.toThrow();
  });

  it('rejects a dependency on an unknown module', () => {
    expect(() => DependencyGraph.from({ a: ['ghost'] }).validate()).toThrow(/unknown module/i);
  });

  it('rejects a cycle', () => {
    expect(() => DependencyGraph.from({ a: ['b'], b: ['a'] }).validate()).toThrow(/cycle/i);
    expect(() => DependencyGraph.from({ a: ['a'] }).validate()).toThrow(/cycle/i);
  });
});

describe('DependencyGraph dependency resolution', () => {
  it('computes transitive deps across a diamond', () => {
    expect([...diamond().transitiveDeps('a')].sort()).toEqual(['b', 'c', 'd']);
  });

  it('resolveEnableSet pulls in all required dependencies', () => {
    expect(diamond().resolveEnableSet(['a']).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(diamond().resolveEnableSet(['b']).sort()).toEqual(['b', 'd']);
  });

  it('flags an enabled set missing a dependency, and passes a complete one', () => {
    const g = diamond();
    expect(g.missingDependencies(['a'])).toEqual([{ node: 'a', missing: ['b', 'c'] }]);
    expect(g.missingDependencies(['a', 'b', 'c', 'd'])).toEqual([]);
  });

  it('orders dependencies before dependents', () => {
    const order = diamond().topoOrder();
    expect(order.indexOf('d')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('a'));
    expect(order.indexOf('c')).toBeLessThan(order.indexOf('a'));
  });
});
