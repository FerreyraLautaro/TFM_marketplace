export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');

export interface DomainEvent {
  type: string;
}

export type EventHandler<E extends DomainEvent> = (
  event: E,
) => void | Promise<void>;

export interface EventPublisher {
  publish<E extends DomainEvent>(event: E): void;
  subscribe<E extends DomainEvent>(
    type: E['type'],
    handler: EventHandler<E>,
  ): void;
}
