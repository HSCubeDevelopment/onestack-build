import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConsumerRegistry } from './consumer-registry';
import { EventBus } from './event-bus';
import { OutboxRelay } from './outbox-relay.service';
import { OutboxService } from './outbox.service';

@Global()
@Module({
  providers: [PrismaService, OutboxService, ConsumerRegistry, EventBus, OutboxRelay],
  exports: [EventBus, OutboxService, ConsumerRegistry, OutboxRelay],
})
export class EventingModule {}
