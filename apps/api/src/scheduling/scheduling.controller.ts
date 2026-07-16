import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { FeatureGuard } from '../composition/feature.guard';
import { RequireFeature } from '../composition/require-feature.decorator';

/**
 * A stub toggleable module. It exists to prove server-side feature enforcement (card #6.2):
 * `scheduling` is OFF by default, so this route returns 404 until a tenant enables the module.
 */
@Controller('scheduling')
@UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
@RequireFeature('scheduling')
export class SchedulingController {
  @Get('ping')
  ping(): { module: 'scheduling'; ok: true } {
    return { module: 'scheduling', ok: true };
  }
}
