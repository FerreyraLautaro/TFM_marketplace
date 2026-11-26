import { Injectable, Logger } from '@nestjs/common';
import {
  DomainEvent,
  EventHandler,
  EventPublisher,
} from '../application/ports/event-publisher';

// Handlers run in-process right after publish; a failing handler is logged and never reaches the caller.
@Injectable()
export class InMemoryEventPublisher implements EventPublisher {
  private readonly logger = new Logger(InMemoryEventPublisher.name);
  private readonly handlers = new Map<string, EventHandler<DomainEvent>[]>();

  subscribe<E extends DomainEvent>(
    type: E['type'],
    handler: EventHandler<E>,
  ): void {
    const handlers = this.handlers.get(type) ?? [];
    handlers.push(handler);
    this.handlers.set(type, handlers);
  }

  publish<E extends DomainEvent>(event: E): void {
    for (const handler of this.handlers.get(event.type) ?? []) {
      try {
        const result = handler(event);
        if (result instanceof Promise) {
          result.catch((error: unknown) => this.logFailure(event, error));
        }
      } catch (error) {
        this.logFailure(event, error);
      }
    }
  }

  private logFailure(event: DomainEvent, error: unknown): void {
    this.logger.error(
      `Handler for ${event.type} failed`,
      error instanceof Error ? error.stack : String(error),
    );
  }
}
