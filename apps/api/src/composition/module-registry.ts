/**
 * The composable platform's module registry (card #6). Each toggleable capability is a "module" with a
 * default on/off. Per-tenant overrides live in onestack_feature_flag. This is the seed of the
 * "tick-box" composition model — a tenant's product is the set of modules switched on for it.
 */
/** Which surface a module belongs to. `core` = shared platform; the rest are industry packs. */
export type ModuleGroup = 'core' | 'automotive';

export interface ModuleDef {
  key: string;
  label: string;
  defaultEnabled: boolean;
  /** Grouping for the feature-admin panel (card #6.3). */
  group: ModuleGroup;
  /**
   * `false` = an always-on core service that the admin panel shows locked and MUST NOT let a tenant
   * turn off (e.g. Contacts). `true` = a switchable feature. Enforced by the admin API, not just the UI.
   */
  toggleable: boolean;
}

export const MODULES = {
  // ---- Core platform (shared by every tenant) ----
  contacts: {
    key: 'contacts',
    label: 'Contacts',
    defaultEnabled: true,
    group: 'core',
    toggleable: false,
  },
  // A module that is OFF by default — used to prove server-side enforcement (card #6.2).
  scheduling: {
    key: 'scheduling',
    label: 'Scheduling',
    defaultEnabled: false,
    group: 'core',
    toggleable: true,
  },

  // ---- Automotive pack (opt-in per tenant; off by default so enabling is a deliberate choice) ----
  vehicles: {
    key: 'vehicles',
    label: 'Vehicles / fleet',
    defaultEnabled: false,
    group: 'automotive',
    toggleable: true,
  },
  movements: {
    key: 'movements',
    label: 'Movements (In / Out)',
    defaultEnabled: false,
    group: 'automotive',
    toggleable: true,
  },
  returns: {
    key: 'returns',
    label: 'Returns',
    defaultEnabled: false,
    group: 'automotive',
    toggleable: true,
  },
  bookings: {
    key: 'bookings',
    label: 'Bookings',
    defaultEnabled: false,
    group: 'automotive',
    toggleable: true,
  },
  tracking: {
    key: 'tracking',
    label: 'CityTag GPS tracking',
    defaultEnabled: false,
    group: 'automotive',
    toggleable: true,
  },
  damage_quote: {
    key: 'damage_quote',
    label: 'Damage → quote (AI)',
    defaultEnabled: false,
    group: 'automotive',
    toggleable: true,
  },
} as const satisfies Record<string, ModuleDef>;

export type ModuleKey = keyof typeof MODULES;

export function isKnownModule(key: string): key is ModuleKey {
  return Object.prototype.hasOwnProperty.call(MODULES, key);
}

export function moduleDefault(key: ModuleKey): boolean {
  return MODULES[key].defaultEnabled;
}

/** True when a module may be switched on/off by a tenant admin (core services return false). */
export function isToggleable(key: ModuleKey): boolean {
  return MODULES[key].toggleable;
}

/** The full catalogue as an array — used by the feature-admin panel (card #6.3). */
export function listModules(): ModuleDef[] {
  return Object.values(MODULES);
}
