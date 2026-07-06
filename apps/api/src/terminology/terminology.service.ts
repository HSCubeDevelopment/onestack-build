import { Injectable } from '@nestjs/common';
import { TerminologyMap, TerminologyTerm } from '../core/pack-contract';
import { PackRegistry } from '../core/pack-registry';

/** Generic labels for core concepts. A vertical pack overrides these to feel native (card #6.6). */
export const DEFAULT_TERMINOLOGY: TerminologyMap = {
  work_item: { label: 'Work Item', plural: 'Work Items' },
  contact: { label: 'Contact', plural: 'Contacts' },
  subject: { label: 'Subject', plural: 'Subjects' },
};

/** Scope resolution to a tenant's active packs (so different tenants see their vertical's labels). */
export interface ResolveOptions {
  packIds?: string[];
}

/**
 * Terminology / label layer (card #6.6). Resolves a core concept to the label the active vertical uses
 * — Work Item → "Job"/"Appointment", Contact → "Customer"/"Patient" — with a generic fallback. Kept
 * deliberately thin (panel flagged over-build): pack config only, no per-tenant terminology rows yet.
 */
@Injectable()
export class TerminologyService {
  constructor(private readonly registry: PackRegistry) {}

  resolve(concept: string, opts: ResolveOptions = {}): TerminologyTerm {
    let term: TerminologyTerm | undefined = DEFAULT_TERMINOLOGY[concept];
    for (const pack of this.activePacks(opts)) {
      const override = pack.terminology?.[concept];
      if (override) term = override; // later active pack wins
    }
    return term ?? { label: humanize(concept), plural: `${humanize(concept)}s` };
  }

  label(concept: string, opts?: ResolveOptions): string {
    return this.resolve(concept, opts).label;
  }

  plural(concept: string, opts?: ResolveOptions): string {
    return this.resolve(concept, opts).plural;
  }

  /** The full resolved map (defaults + active-pack overrides) — embed in API responses / render context. */
  all(opts: ResolveOptions = {}): TerminologyMap {
    const out: TerminologyMap = { ...DEFAULT_TERMINOLOGY };
    for (const pack of this.activePacks(opts)) Object.assign(out, pack.terminology ?? {});
    return out;
  }

  private activePacks(opts: ResolveOptions) {
    return this.registry.listPacks().filter((p) => !opts.packIds || opts.packIds.includes(p.id));
  }
}

function humanize(concept: string): string {
  return concept
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
