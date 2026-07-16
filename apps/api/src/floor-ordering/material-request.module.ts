import { Module } from '@nestjs/common';
import { WorkItemModule } from '../work-items/work-item.module';
import { MaterialRequestController } from './material-request.controller';
import { MaterialRequestService } from './material-request.service';
import {
  MATERIAL_ORDER_SENDER,
  MaterialOrderSender,
  NoopMaterialOrderSender,
} from './material-order-sender';

/**
 * Floor ordering (Phase 2). Technician material requests on a job, a manager (OWNER) approval step, and
 * ordering (emailing a supplier) behind a vendor boundary (no-op by default). Owns its own tables; the
 * manager step is gated at the route with @Roles.
 *
 * Imports WorkItemModule for its exported WorkItemService — used only to answer "is this job visible to
 * this caller?" so a STAFF technician can't raise or read parts against someone else's job. That's the
 * sanctioned cross-module route (an exported service), not a reach into another module's tables.
 */
@Module({
  imports: [WorkItemModule],
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
