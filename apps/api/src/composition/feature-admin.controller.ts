import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { FeatureFlagService } from './feature-flag.service';
import { isKnownModule, listModules, MODULES, ModuleKey } from './module-registry';

/** One row in the feature-admin panel (card #6.3). */
export interface FeatureView {
  key: string;
  label: string;
  group: string;
  enabled: boolean;
  /** Core services are always-on and cannot be switched off — the panel shows them locked. */
  toggleable: boolean;
}

/**
 * Feature-admin API (card #6.3) — the panel a tenant OWNER uses to compose their own product.
 *
 * OWNER-only: guarded by RolesGuard with no @AllowStaff, so STAFF get 403 (fail-closed default).
 * Tenant-scoped: the tenantId always comes from the verified JWT (never the request body), and every
 * flag read/write goes through FeatureFlagService → runInTenant, so RLS makes it impossible for an owner
 * to see or change another tenant's flags. Enforcement of a disabled feature (404 on its routes, silent
 * events) already lives in FeatureGuard + EventBus — this controller only edits the switches.
 *
 * Off-limits (rulebook §7: composition + permissions + tenancy) — requires senior review before merge.
 */
@Controller('admin/features')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FeatureAdminController {
  constructor(private readonly flags: FeatureFlagService) {}

  /** The full catalogue with this tenant's on/off state. Core (non-toggleable) always reads enabled. */
  @Get()
  async list(@CurrentUser() user: AuthContext): Promise<FeatureView[]> {
    const enabled = await this.flags.allForTenant(user.tenantId);
    return listModules().map((m) => ({
      key: m.key,
      label: m.label,
      group: m.group,
      toggleable: m.toggleable,
      enabled: m.toggleable ? enabled[m.key as ModuleKey] : true,
    }));
  }

  /** Switch a feature on/off for the caller's own tenant. */
  @Patch(':key')
  async setEnabled(
    @CurrentUser() user: AuthContext,
    @Param('key') key: string,
    @Body() body: { enabled?: unknown },
  ): Promise<FeatureView> {
    if (!isKnownModule(key)) {
      // Don't reveal which keys exist — an unknown feature is simply "not found".
      throw new NotFoundException('Unknown feature');
    }
    const def = MODULES[key];
    if (!def.toggleable) {
      throw new UnprocessableEntityException('This is a core feature and cannot be turned off.');
    }
    if (typeof body?.enabled !== 'boolean') {
      throw new UnprocessableEntityException('`enabled` must be true or false.');
    }
    await this.flags.setEnabled(user.tenantId, key, body.enabled);
    return { key: def.key, label: def.label, group: def.group, toggleable: def.toggleable, enabled: body.enabled };
  }
}
