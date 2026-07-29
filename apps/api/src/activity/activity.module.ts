import { Module } from '@nestjs/common';
import { FleetModule } from '../fleet/fleet.module';
import { TicketsModule } from '../tickets/tickets.module';
import { WorkItemModule } from '../work-items/work-item.module';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';

/**
 * Activity directory — a read-only cross-car feed for the employee "Car history" screen. Composes the
 * public services of Fleet (movements), Tickets, and Work Items (jobs); owns no tables of its own. Like
 * the AI module, it depends on other modules only through their exported services (§5), so all three
 * modules must be imported here for their providers to be injectable.
 */
@Module({
  imports: [FleetModule, TicketsModule, WorkItemModule],
  controllers: [ActivityController],
  providers: [ActivityService],
})
export class ActivityModule {}
