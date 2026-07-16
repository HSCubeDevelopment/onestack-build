import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CreateWebhookDto } from './dto/webhooks.dto';
import { DeliveryView, WebhookEndpointView, WebhooksService } from './webhooks.service';

/**
 * Webhooks — owner (Phase 4, card #252). Register endpoint URLs + events, send a test, and view the
 * delivery log. Payloads are signed (X-OneStack-Signature). Tenant-scoped.
 */
@Controller('webhooks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post()
  create(
    @CurrentUser() user: AuthContext,
    @Body() dto: CreateWebhookDto,
  ): Promise<WebhookEndpointView> {
    return this.webhooks.create(user.tenantId, dto.url, dto.events);
  }

  @Get()
  list(@CurrentUser() user: AuthContext): Promise<WebhookEndpointView[]> {
    return this.webhooks.list(user.tenantId);
  }

  @Post(':id/test')
  test(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<DeliveryView> {
    return this.webhooks.test(user.tenantId, id);
  }

  @Get(':id/deliveries')
  deliveries(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<DeliveryView[]> {
    return this.webhooks.deliveries(user.tenantId, id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<void> {
    await this.webhooks.remove(user.tenantId, id);
  }
}
