/**
 * The composable platform's module registry (card #6). Each toggleable capability is a "module" with a
 * default on/off. Per-tenant overrides live in onestack_feature_flag. This is the seed of the
 * "tick-box" composition model — a tenant's product is the set of modules switched on for it.
 */
export interface ModuleDef {
  key: string;
  label: string;
  defaultEnabled: boolean;
}

export const MODULES = {
  contacts: { key: 'contacts', label: 'Contacts', defaultEnabled: true },
  // A module that is OFF by default — used to prove server-side enforcement (card #6.2).
  scheduling: { key: 'scheduling', label: 'Scheduling', defaultEnabled: false },
} as const satisfies Record<string, ModuleDef>;

export type ModuleKey = keyof typeof MODULES;

export function isKnownModule(key: string): key is ModuleKey {
  return Object.prototype.hasOwnProperty.call(MODULES, key);
}

export function moduleDefault(key: ModuleKey): boolean {
  return MODULES[key].defaultEnabled;
}
