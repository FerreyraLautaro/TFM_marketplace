import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from '../../events/application/ports/event-publisher';
import { ORDER_EVENT_TYPES, OrderEvent } from '../domain/order.events';

@Injectable()
export class OrderEventsLogger implements OnModuleInit {
  private readonly logger = new Logger('OrderEvents');

  constructor(
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
  ) {}

  onModuleInit(): void {
    for (const type of ORDER_EVENT_TYPES) {
      this.events.subscribe<OrderEvent>(type, ({ type: name, ...payload }) =>
        this.logger.log(`${name} ${JSON.stringify(payload)}`),
      );
    }
  }
}
