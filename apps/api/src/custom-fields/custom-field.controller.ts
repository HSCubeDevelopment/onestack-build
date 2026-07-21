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
import { AllowStaff } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CustomFieldService, CustomFieldTarget, CustomFieldView } from './custom-field.service';
import { DefineCustomFieldDto, UpdateCustomFieldDto } from './dto/custom-field.dto';

/** Settings → Custom fields (card #11): a shop defines its own fields for customers & vehicles. */
@Controller('custom-fields')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomFieldController {
  constructor(private readonly fields: CustomFieldService) {}

  @Post()
  define(
    @CurrentUser() user: AuthContext,
    @Body() dto: DefineCustomFieldDto,
  ): Promise<CustomFieldView> {
    return this.fields.define(user.tenantId, dto);
  }

  /**
   * Reading the field DEFINITIONS is open to STAFF — a worker viewing a customer or vehicle needs the
   * labels/types to render its custom fields (the values live on records they can already see). Only
   * DEFINING/editing/archiving fields (below) stays OWNER-only.
   */
  @AllowStaff()
  @Get()
  list(
    @CurrentUser() user: AuthContext,
    @Query('appliesTo') appliesTo?: CustomFieldTarget,
  ): Promise<CustomFieldView[]> {
    return this.fields.list(user.tenantId, appliesTo);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateCustomFieldDto,
  ): Promise<CustomFieldView> {
    return this.fields.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async archive(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<void> {
    await this.fields.archive(user.tenantId, id);
  }
}
