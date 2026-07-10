import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

/** Inventory & stock (Phase 4, card #220). Owns the item + movement tables; TenantService is global. */
@Module({
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}
