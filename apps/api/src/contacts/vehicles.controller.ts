import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsObject } from 'class-validator';
import { AuthContext } from '../auth/auth.types';
import { AllowStaff } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { SubjectService, SubjectView } from '../subjects/subject.service';

class SetVehicleCustomFieldsDto {
  @IsObject()
  customFields!: Record<string, unknown>;
}

/**
 * Vehicle lookup + custom fields (cards #10, #11). `q` searches across rego / VIN / make / model; the
 * legacy `rego` param still works for a rego-only lookup.
 */
@Controller('vehicles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VehiclesController {
  constructor(private readonly subjects: SubjectService) {}

  @AllowStaff()
  @Get()
  search(
    @CurrentUser() user: AuthContext,
    @Query('q') q?: string,
    @Query('rego') rego?: string,
  ): Promise<SubjectView[]> {
    if (q) {
      return this.subjects.searchAcrossFields(
        user.tenantId,
        'vehicle',
        ['rego', 'vin', 'make', 'model'],
        q,
      );
    }
    if (rego) return this.subjects.searchByField(user.tenantId, 'vehicle', 'rego', rego);
    throw new BadRequestException('q or rego query is required');
  }

  @Patch(':id/custom-fields')
  setCustomFields(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: SetVehicleCustomFieldsDto,
  ): Promise<SubjectView> {
    return this.subjects.setCustomFields(user.tenantId, id, dto.customFields);
  }
}
