import { Injectable } from '@nestjs/common';
import { ModuleKey } from '../composition/module-registry';
import { DependencyGraph, DepViolation } from './dependency-graph';

/**
 * The dependency catalogue for real modules (card #8). Keys are ModuleKeys from the composition registry;
 * values are the modules each one requires to function. Keep this in lockstep with MODULES.
 */
export const MODULE_DEPENDENCIES: Record<ModuleKey, ModuleKey[]> = {
  contacts: [],
  scheduling: ['contacts'], // you can't schedule against nobody — scheduling needs contacts
  // Automotive-pack modules added with the feature-admin panel (#136). Their real dependency edges are
  // not defined yet, so they're declared with none for now (conservative — this never blocks a valid
  // combination). Fill these in as the automotive module relationships are decided.
  vehicles: [],
  movements: [],
  returns: [],
  bookings: [],
  tracking: [],
  damage_quote: [],
};

/**
 * Answers "can this set of modules be provisioned together?" and "what does enabling X require?" so the
 * tick-box composition can never end up in an invalid combination.
 */
@Injectable()
export class ModuleCatalog {
  private readonly graph = DependencyGraph.from(MODULE_DEPENDENCIES);

  constructor() {
    this.graph.validate(); // fail fast at boot if the catalogue is malformed (unknown dep / cycle)
  }

  /** Expand a requested enable set to include required dependencies. */
  resolveEnableSet(keys: ModuleKey[]): ModuleKey[] {
    return this.graph.resolveEnableSet(keys) as ModuleKey[];
  }

  /** Modules in the proposed set whose dependencies are not also enabled (invalid to provision). */
  validateEnabledSet(enabled: ModuleKey[]): DepViolation[] {
    return this.graph.missingDependencies(enabled);
  }

  /** Modules in dependency-first order (useful for provisioning/migration ordering). */
  order(): ModuleKey[] {
    return this.graph.topoOrder() as ModuleKey[];
  }
}
