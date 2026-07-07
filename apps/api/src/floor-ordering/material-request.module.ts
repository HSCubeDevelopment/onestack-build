import { Module } from '@nestjs/common';
import { MaterialRequestController } from './material-request.controller';
import { MaterialRequestService } from './material-request.service';
import {
  MATERIAL_ORDER_SENDER,
  MaterialOrderSender,
  NoopMaterialOrderSender,
} from './material-order-sender';

/**
 * Floor ordering (Phase 2). Technician material requests on a job, a manager (OWNER) approval step, and
 * ordering (emailing a supplier) behind a vendor boundary (no-op by default). Self-contained — reads the
 * job via TenantService directly (its own tables) and gates the manager step at the route with @Roles.
 */
@Module({
  controllers: [MaterialRequestController],
  providers: [
    MaterialRequestService,
    {
      // Email-a-material-order vendor boundary. No-op until an email provider is chosen.
      provide: MATERIAL_ORDER_SENDER,
      useFactory: (): MaterialOrderSender => new NoopMaterialOrderSender(),
    },
  ],
})
export class MaterialRequestModule {}
