import { Module } from '@nestjs/common';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';

/** Point of sale (Phase 4, card #221). Owns sale + sale-line tables; TenantService is global. */
@Module({ controllers: [PosController], providers: [PosService] })
export class PosModule {}
