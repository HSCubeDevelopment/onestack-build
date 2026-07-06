import { Injectable } from '@nestjs/common';
import { EventConsumer } from './event-types';

/** Holds the registered durable consumers (card #9). Modules subscribe here instead of calling each other. */
@Injectable()
export class ConsumerRegistry {
  private consumers: EventConsumer[] = [];

  register(consumer: EventConsumer): void {
    const clash = this.consumers.find((c) => c.name === consumer.name && c.type !== consumer.type);
    if (clash) throw new Error(`Consumer name "${consumer.name}" already bound to "${clash.type}"`);
    this.consumers.push(consumer);
  }

  for(type: string): EventConsumer[] {
    return this.consumers.filter((c) => c.type === type);
  }

  reset(): void {
    this.consumers = [];
  }
}
