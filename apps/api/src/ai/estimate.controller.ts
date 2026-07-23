import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AllowStaff } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { EstimateFromPhotosDto } from './dto/estimate.dto';
import { EstimateResult, EstimateService } from './estimate.service';

/**
 * Instant photo estimate for the shop floor (employee flow). A worker photographs a damaged car and gets
 * a rough, editable draft — what needs fixing, the parts likely needed, and a ballpark price. Open to
 * staff (@AllowStaff); nothing is stored or sent. The draft is a starting point the estimator confirms.
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class EstimateController {
  constructor(private readonly estimates: EstimateService) {}

  @AllowStaff()
  @Post('estimates/from-photos')
  fromPhotos(
    @CurrentUser() _user: AuthContext,
    @Body() dto: EstimateFromPhotosDto,
  ): Promise<EstimateResult> {
    return this.estimates.estimate(dto);
  }
}
