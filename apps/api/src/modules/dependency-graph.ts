/**
 * A generic module dependency graph (card #8). Pure, in-memory. Underpins the tick-box composition:
 * it catalogues what depends on what so invalid combinations can't be provisioned, expands a requested
 * set to include required dependencies, and orders modules deps-first.
 */
export interface DepViolation {
  node: string;
  missing: string[];
}

export class DependencyGraph {
  constructor(private readonly deps: Map<string, string[]>) {}

  static from(record: Record<string, string[]>): DependencyGraph {
    return new DependencyGraph(new Map(Object.entries(record)));
  }

  nodes(): string[] {
    return [...this.deps.keys()];
  }

  directDeps(node: string): string[] {
    const d = this.deps.get(node);
    if (!d) throw new Error(`Unknown module: ${node}`);
    return d;
  }

  /** Every dependency must reference a known node, and the graph must be acyclic. Throws otherwise. */
  validate(): void {
    for (const [node, deps] of this.deps) {
      for (const d of deps) {
        if (!this.deps.has(d)) throw new Error(`Module "${node}" depends on unknown module "${d}"`);
      }
    }
    const WHITE = 0;
    const GRAY = 1;
    const BLACK = 2;
    const color = new Map<string, number>(this.nodes().map((n) => [n, WHITE]));
    const stack: string[] = [];
    const visit = (n: string): void => {
      color.set(n, GRAY);
      stack.push(n);
      for (const d of this.directDeps(n)) {
        if (color.get(d) === GRAY)
          throw new Error(`Dependency cycle: ${[...stack, d].join(' -> ')}`);
        if (color.get(d) === WHITE) visit(d);
      }
      stack.pop();
      color.set(n, BLACK);
    };
    for (const n of this.nodes()) if (color.get(n) === WHITE) visit(n);
  }

  /** All transitive dependencies of a node (terminates even on a cycle). */
  transitiveDeps(node: string): Set<string> {
    const out = new Set<string>();
    const walk = (n: string): void => {
      for (const d of this.directDeps(n)) {
        if (!out.has(d)) {
          out.add(d);
          walk(d);
        }
      }
    };
    walk(node);
    return out;
  }

  /** Enabling `keys` requires the full closure: the keys plus all their transitive dependencies. */
  resolveEnableSet(keys: string[]): string[] {
    const set = new Set<string>();
    for (const k of keys) {
      set.add(k);
      for (const d of this.transitiveDeps(k)) set.add(d);
    }
    return [...set];
  }

  /** For a proposed enabled set, the modules whose direct deps are not also enabled (invalid to provision). */
  missingDependencies(enabled: string[]): DepViolation[] {
    const set = new Set(enabled);
    const violations: DepViolation[] = [];
    for (const n of enabled) {
      const missing = this.directDeps(n).filter((d) => !set.has(d));
      if (missing.length > 0) violations.push({ node: n, missing });
    }
    return violations;
  }

  /** Topological order: dependencies appear before the modules that depend on them. */
  topoOrder(): string[] {
    const order: string[] = [];
    const seen = new Set<string>();
    const visit = (n: string): void => {
      if (seen.has(n)) return;
      seen.add(n);
      for (const d of this.directDeps(n)) visit(d);
      order.push(n);
    };
    for (const n of this.nodes()) visit(n);
    return order;
  }
}
