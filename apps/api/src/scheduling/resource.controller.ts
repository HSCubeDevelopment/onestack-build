import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { FeatureGuard } from '../composition/feature.guard';
import { RequireFeature } from '../composition/require-feature.decorator';
import { CreateResourceDto, UpdateResourceDto } from './dto/scheduling.dto';
import { ResourceService, ResourceView } from './resource.service';

/**
 * Bookable-resource setup (card #23) — bays & technicians. Gated behind the toggleable `scheduling`
 * module. Deleting a resource with bookings is refused unless ?force=true.
 */
@Controller('resources')
@UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
@RequireFeature('scheduling')
export class ResourceController {
  constructor(private readonly resources: ResourceService) {}

  @Post()
  create(@CurrentUser() user: AuthContext, @Body() dto: CreateResourceDto): Promise<ResourceView> {
    return this.resources.create(user.tenantId, dto.type, dto.name);
  }

  @Get()
  list(@CurrentUser() user: AuthContext): Promise<ResourceView[]> {
    return this.resources.list(user.tenantId);
  }

  @Patch(':id')
  rename(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateResourceDto,
  ): Promise<ResourceView> {
    return this.resources.rename(user.tenantId, id, dto.name);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Query('force') force?: string,
  ): Promise<void> {
    await this.resources.remove(user.tenantId, id, force === 'true');
  }
}
