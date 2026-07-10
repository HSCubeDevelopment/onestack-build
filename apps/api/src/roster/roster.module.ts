import { Module } from '@nestjs/common';
import { RosterController } from './roster.controller';
import { RosterService } from './roster.service';

/**
 * Roster & staff management (Phase 4, card #211). Owns the shift table; TenantService is global.
 */
@Module({
  controllers: [RosterController],
  providers: [RosterService],
})
export class RosterModule {}
