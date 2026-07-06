import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { SubjectService, SubjectView } from '../subjects/subject.service';

/** Vehicle lookup for the automotive vertical (card #10) — e.g. find a customer by their car's rego. */
@Controller('vehicles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VehiclesController {
  constructor(private readonly subjects: SubjectService) {}

  @Get()
  search(@CurrentUser() user: AuthContext, @Query('rego') rego?: string): Promise<SubjectView[]> {
    if (!rego) throw new BadRequestException('rego query is required');
    return this.subjects.searchByField(user.tenantId, 'vehicle', 'rego', rego);
  }
}
