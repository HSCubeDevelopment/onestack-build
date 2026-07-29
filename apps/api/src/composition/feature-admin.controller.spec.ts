import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../auth/auth.types';
import { FeatureAdminController } from './feature-admin.controller';
import type { FeatureFlagService } from './feature-flag.service';
import { listModules, moduleDefault, ModuleKey } from './module-registry';

const OWNER: AuthContext = { userId: 'u1', tenantId: 'tenant-A', role: 'OWNER' };

/** A full defaults map so allForTenant() returns every registered key. */
function defaultsMap(): Record<ModuleKey, boolean> {
  const out = {} as Record<ModuleKey, boolean>;
  for (const m of listModules()) out[m.key as ModuleKey] = moduleDefault(m.key as ModuleKey);
  return out;
}

describe('FeatureAdminController', () => {
  let flags: { allForTenant: ReturnType<typeof vi.fn>; setEnabled: ReturnType<typeof vi.fn> };
  let ctrl: FeatureAdminController;

  beforeEach(() => {
    flags = {
      allForTenant: vi.fn().mockResolvedValue(defaultsMap()),
      setEnabled: vi.fn().mockResolvedValue(undefined),
    };
    ctrl = new FeatureAdminController(flags as unknown as FeatureFlagService);
  });

  it('lists the catalogue and reads flags for the caller’s own tenant', async () => {
    const rows = await ctrl.list(OWNER);
    expect(flags.allForTenant).toHaveBeenCalledWith('tenant-A');
    const contacts = rows.find((r) => r.key === 'contacts')!;
    expect(contacts.toggleable).toBe(false);
    expect(contacts.enabled).toBe(true);
    const vehicles = rows.find((r) => r.key === 'vehicles')!;
    expect(vehicles.toggleable).toBe(true);
    expect(vehicles.enabled).toBe(false);
  });

  it('enables a pack feature for the JWT tenant (never a body-supplied tenant)', async () => {
    const view = await ctrl.setEnabled(OWNER, 'vehicles', { enabled: true });
    expect(flags.setEnabled).toHaveBeenCalledWith('tenant-A', 'vehicles', true);
    expect(view).toMatchObject({ key: 'vehicles', enabled: true });
  });

  it('404s an unknown feature without revealing the catalogue', async () => {
    await expect(ctrl.setEnabled(OWNER, 'nope', { enabled: true })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(flags.setEnabled).not.toHaveBeenCalled();
  });

  it('refuses to switch off a core (non-toggleable) feature', async () => {
    await expect(ctrl.setEnabled(OWNER, 'contacts', { enabled: false })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(flags.setEnabled).not.toHaveBeenCalled();
  });

  it('rejects a non-boolean enabled value', async () => {
    await expect(ctrl.setEnabled(OWNER, 'vehicles', { enabled: 'yes' })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(flags.setEnabled).not.toHaveBeenCalled();
  });
});
