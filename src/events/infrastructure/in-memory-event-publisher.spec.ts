import { Logger } from '@nestjs/common';
import { DomainEvent } from '../application/ports/event-publisher';
import { InMemoryEventPublisher } from './in-memory-event-publisher';

interface Ping extends DomainEvent {
  type: 'Ping';
  value: number;
}

describe('InMemoryEventPublisher', () => {
  let publisher: InMemoryEventPublisher;
  let logError: jest.SpyInstance;

  beforeEach(() => {
    publisher = new InMemoryEventPublisher();
    logError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => logError.mockRestore());

  it('delivers an event to every handler subscribed to its type', () => {
    const first = jest.fn();
    const second = jest.fn();
    publisher.subscribe<Ping>('Ping', first);
    publisher.subscribe<Ping>('Ping', second);

    publisher.publish({ type: 'Ping', value: 1 });

    expect(first).toHaveBeenCalledWith({ type: 'Ping', value: 1 });
    expect(second).toHaveBeenCalledWith({ type: 'Ping', value: 1 });
  });

  it('does not deliver events of other types', () => {
    const handler = jest.fn();
    publisher.subscribe('Pong', handler);

    publisher.publish({ type: 'Ping' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('does nothing when an event has no subscribers', () => {
    expect(() => publisher.publish({ type: 'Ping' })).not.toThrow();
  });

  it('logs a throwing handler and keeps delivering to the others', () => {
    const after = jest.fn();
    publisher.subscribe('Ping', () => {
      throw new Error('boom');
    });
    publisher.subscribe('Ping', after);

    expect(() => publisher.publish({ type: 'Ping' })).not.toThrow();
    expect(after).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(
      'Handler for Ping failed',
      expect.stringContaining('boom'),
    );
  });

  it('logs a rejected async handler without throwing', async () => {
    publisher.subscribe('Ping', () => Promise.reject(new Error('async boom')));

    expect(() => publisher.publish({ type: 'Ping' })).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));

    expect(logError).toHaveBeenCalledWith(
      'Handler for Ping failed',
      expect.stringContaining('async boom'),
    );
  });
});
